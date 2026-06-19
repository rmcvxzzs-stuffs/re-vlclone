import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db: Database.Database = new Database(path.resolve("re-vlclone.db"));
db.pragma("journal_mode = WAL");

function runMigrations() {
  const migrationsDir = path.resolve("backend/database/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT filename FROM _migrations")
      .all()
      .map((row: any) => row.filename),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    console.log("Applying migration:", file);
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
  }
}

runMigrations();

export default db;
