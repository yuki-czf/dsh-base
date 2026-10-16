import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openDb, migrate, currentVersion, kvSet, kvGet } from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-db-'));
});

describe('db 迁移', () => {
  it('迁移幂等：重复执行不报错且版本一致', () => {
    const db = openDb(dir);
    migrate(db);
    const v1 = currentVersion(db);
    migrate(db);
    expect(currentVersion(db)).toBe(v1);
    expect(v1).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('sessions 主键 (tool, session_id) 冲突被 upsert', () => {
    const db = openDb(dir);
    migrate(db);
    const ins = db.prepare(`INSERT INTO sessions(tool, session_id, status, updated_at) VALUES ('dsh', 's1', 'running', 1)`);
    ins.run();
    db.prepare(`INSERT INTO sessions(tool, session_id, status, updated_at) VALUES ('dsh', 's1', 'completed', 2)
      ON CONFLICT(tool, session_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`).run();
    const row = db.prepare(`SELECT status, updated_at FROM sessions WHERE tool='dsh' AND session_id='s1'`).get() as { status: string; updated_at: number };
    expect(row.status).toBe('completed');
    expect(row.updated_at).toBe(2);
    db.close();
  });

  it('dedupe 主键去重 + kv 读写', () => {
    const db = openDb(dir);
    migrate(db);
    const ins = db.prepare('INSERT OR IGNORE INTO dedupe(tool, session_id, transition, notified_at) VALUES (?, ?, ?, ?)');
    ins.run('dsh', 's1', 'turn:t1:completed', 1);
    ins.run('dsh', 's1', 'turn:t1:completed', 2);
    const count = (db.prepare('SELECT COUNT(*) AS c FROM dedupe').get() as { c: number }).c;
    expect(count).toBe(1);
    kvSet(db, 'k', 'v');
    expect(kvGet(db, 'k')).toBe('v');
    db.close();
  });

  it('内存库同构建表（适配器测试用）', () => {
    const mem = new Database(':memory:');
    mem.exec(`CREATE TABLE turns (session_id TEXT, turn_id TEXT, status TEXT, started_at INTEGER, completed_at INTEGER, duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, computed_total_tokens INTEGER, error_code TEXT, error_type TEXT, cancelled_by_user INTEGER)`);
    expect(mem.prepare('SELECT COUNT(*) AS c FROM turns').get()).toEqual({ c: 0 });
    mem.close();
  });
});
