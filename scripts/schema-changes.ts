import * as readline from "node:readline/promises";

export interface ColumnDef {
  [columnName: string]: string;
}

export interface TableSchema {
  description?: string;
  columns: ColumnDef;
  constraints?: {
    unique?: string[];
    [key: string]: unknown;
  };
}

export interface Schema {
  [tableName: string]: TableSchema;
}

export type ChangeOp =
  | { kind: "create_table"; table: string; def: TableSchema }
  | { kind: "drop_table"; table: string }
  | { kind: "rename_table"; from: string; to: string }
  | { kind: "add_column"; table: string; column: string; type: string }
  | { kind: "drop_column"; table: string; column: string }
  | {
      kind: "rename_column";
      table: string;
      from: string;
      to: string;
      type: string;
    }
  | {
      kind: "change_column_type";
      table: string;
      column: string;
      oldType: string;
      newType: string;
    };

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirm(question: string): Promise<boolean> {
  const answer = await rl.question(`${question} (y/n) `);
  return answer.trim().toLowerCase().startsWith("y");
}

// reserved keys inside a table block that aren't actually tables
function getTableNames(schema: Schema): string[] {
  return Object.keys(schema).filter((k) => !k.startsWith("_"));
}

export async function diffSchemas(
  oldSchema: Schema,
  newSchema: Schema,
): Promise<ChangeOp[]> {
  const ops: ChangeOp[] = [];

  const oldTables = new Set(getTableNames(oldSchema));
  const newTables = new Set(getTableNames(newSchema));

  const removedTables = [...oldTables].filter((t) => !newTables.has(t));
  const addedTables = [...newTables].filter((t) => !oldTables.has(t));
  const commonTables = [...oldTables].filter((t) => newTables.has(t));

  // detect table renames among removed/added pairs
  const consumedRemoved = new Set<string>();
  const consumedAdded = new Set<string>();

  for (const removed of removedTables) {
    for (const added of addedTables) {
      if (consumedAdded.has(added)) continue;
      const isRename = await confirm(
        `Table "${removed}" was removed and "${added}" was added. Did you rename "${removed}" to "${added}"?`,
      );
      if (isRename) {
        ops.push({ kind: "rename_table", from: removed, to: added });
        consumedRemoved.add(removed);
        consumedAdded.add(added);
        // treat the renamed table as "common" so column diffing still runs
        commonTables.push(added);
        // stash old def under new name for column diffing below
        oldSchema[added] = oldSchema[removed]!;
        break;
      }
    }
  }

  for (const t of removedTables) {
    if (!consumedRemoved.has(t)) {
      ops.push({ kind: "drop_table", table: t });
    }
  }

  for (const t of addedTables) {
    if (!consumedAdded.has(t)) {
      ops.push({ kind: "create_table", table: t, def: newSchema[t]! });
    }
  }

  // diff columns within tables that exist in both (or were renamed)
  for (const table of commonTables) {
    const oldCols = oldSchema[table]?.columns ?? {};
    const newCols = newSchema[table]?.columns ?? {};

    const oldColNames = new Set(Object.keys(oldCols));
    const newColNames = new Set(Object.keys(newCols));

    const removedCols = [...oldColNames].filter((c) => !newColNames.has(c));
    const addedCols = [...newColNames].filter((c) => !oldColNames.has(c));
    const commonCols = [...oldColNames].filter((c) => newColNames.has(c));

    const consumedRemovedCols = new Set<string>();
    const consumedAddedCols = new Set<string>();

    for (const removed of removedCols) {
      for (const added of addedCols) {
        if (consumedAddedCols.has(added)) continue;
        const isRename = await confirm(
          `In table "${table}", column "${removed}" was removed and "${added}" was added. Did you rename "${removed}" to "${added}"?`,
        );
        if (isRename) {
          ops.push({
            kind: "rename_column",
            table,
            from: removed,
            to: added,
            type: newCols[added]!,
          });
          consumedRemovedCols.add(removed);
          consumedAddedCols.add(added);
          break;
        }
      }
    }

    for (const c of removedCols) {
      if (!consumedRemovedCols.has(c)) {
        ops.push({ kind: "drop_column", table, column: c });
      }
    }

    for (const c of addedCols) {
      if (!consumedAddedCols.has(c)) {
        ops.push({ kind: "add_column", table, column: c, type: newCols[c]! });
      }
    }

    for (const c of commonCols) {
      if (oldCols[c] !== newCols[c]) {
        ops.push({
          kind: "change_column_type",
          table,
          column: c,
          oldType: oldCols[c]!,
          newType: newCols[c]!,
        });
      }
    }
  }

  return ops;
}

export function closeReadline() {
  rl.close();
}
