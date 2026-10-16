import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS sessions (
    tool TEXT NOT NULL,
    session_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idle',
    started_at INTEGER NOT NULL DEFAULT 0,
    last_turn_at INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER,
    model TEXT,
    last_assistant_excerpt TEXT,
    delegation_depth INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tool, session_id)
  );
  CREATE TABLE IF NOT EXISTS turns (
    tool TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL DEFAULT 0,
    ended_at INTEGER,
    tokens INTEGER,
    model TEXT,
    error_code TEXT,
    notified INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tool, session_id, turn_id)
  );
  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(tool, session_id, started_at);
  CREATE TABLE IF NOT EXISTS dedupe (
    tool TEXT NOT NULL,
    session_id TEXT NOT NULL,
    transition TEXT NOT NULL,
    notified_at INTEGER NOT NULL,
    PRIMARY KEY (tool, session_id, transition)
  );
  CREATE TABLE IF NOT EXISTS notify_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );
  `,
];

export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'monitor.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER PRIMARY KEY)');
  const row = db.prepare('SELECT MAX(v) AS v FROM schema_version').get() as { v: number | null };
  let current = row?.v ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const run = db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.prepare('INSERT INTO schema_version(v) VALUES (?)').run(v + 1);
    });
    run();
    current = v + 1;
  }
}

export function currentVersion(db: DB): number {
  try {
    const row = db.prepare('SELECT MAX(v) AS v FROM schema_version').get() as { v: number | null };
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

export function kvGet(db: DB, k: string): string | undefined {
  const row = db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined;
  return row?.v;
}

export function kvSet(db: DB, k: string, v: string): void {
  db.prepare('INSERT INTO kv(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

/** 外部只读连接：SQLITE_OPEN_READONLY（等效 mode=ro），WAL 库禁用 immutable */
export function openReadonlySqlite(file: string): DB {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  return db;
}
