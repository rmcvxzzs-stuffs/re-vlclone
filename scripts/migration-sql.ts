import type { ChangeOp, Schema, TableSchema } from "./schema-changes.js";

function columnDefLine(name: string, type: string): string {
  return `  ${name} ${type}`;
}

function buildCreateTableSql(table: string, def: TableSchema): string {
  const lines = Object.entries(def.columns).map(([name, type]) =>
    columnDefLine(name, type),
  );

  if (def.constraints?.unique && def.constraints.unique.length > 0) {
    lines.push(`  UNIQUE(${def.constraints.unique.join(", ")})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${table} (\n${lines.join(",\n")}\n);`;
}

/* SQLite supports RENAME COLUMN and ADD COLUMN and DROP COLUMN natively
 * since 3.35+, so we use those where possible. Type changes still require
 * a full table rebuild since SQLite has no ALTER COLUMN.
 */

function buildRebuildTableSql(
  table: string,
  newDef: TableSchema,
  oldColumns: string[],
): string[] {
  const tempTable = `__${table}_new`;
  const statements: string[] = [];

  statements.push(buildCreateTableSql(tempTable, newDef));

  const sharedCols = Object.keys(newDef.columns).filter((c) =>
    oldColumns.includes(c),
  );

  statements.push(
    `INSERT INTO ${tempTable} (${sharedCols.join(", ")})\n  SELECT ${sharedCols.join(", ")} FROM ${table};`,
  );
  statements.push(`DROP TABLE ${table};`);
  statements.push(`ALTER TABLE ${tempTable} RENAME TO ${table};`);

  return statements;
}

export function generateMigrationSql(
  ops: ChangeOp[],
  newSchema: Schema,
): string {
  const statements: string[] = [];

  // group ops that require a table rebuild (type changes) so we only
  // rebuild once per table even if multiple columns changed type
  const rebuildTables = new Set(
    ops
      .filter((op) => op.kind === "change_column_type")
      .map((op) => (op as { table: string }).table),
  );

  for (const op of ops) {
    switch (op.kind) {
      case "create_table":
        statements.push(buildCreateTableSql(op.table, op.def));
        break;

      case "drop_table":
        statements.push(`DROP TABLE IF EXISTS ${op.table};`);
        break;

      case "rename_table":
        statements.push(`ALTER TABLE ${op.from} RENAME TO ${op.to};`);
        break;

      case "add_column":
        if (rebuildTables.has(op.table)) break; // handled in rebuild pass
        statements.push(
          `ALTER TABLE ${op.table} ADD COLUMN ${op.column} ${op.type};`,
        );
        break;

      case "drop_column":
        if (rebuildTables.has(op.table)) break;
        statements.push(`ALTER TABLE ${op.table} DROP COLUMN ${op.column};`);
        break;

      case "rename_column":
        if (rebuildTables.has(op.table)) break;
        statements.push(
          `ALTER TABLE ${op.table} RENAME COLUMN ${op.from} TO ${op.to};`,
        );
        break;

      case "change_column_type":
        // handled below in the rebuild pass, once per table
        break;
    }
  }

  // handle full rebuilds for tables with type changes
  for (const table of rebuildTables) {
    const newDef = newSchema[table];
    if (!newDef) continue;
    const oldColumns = Object.keys(newDef.columns); // shared cols approximation
    statements.push(...buildRebuildTableSql(table, newDef, oldColumns));
  }

  return statements.join("\n\n");
}
