import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OpenChamberAdapter } from '../src/adapters/openchamber.js';
import { ZCodeAdapter } from '../src/adapters/zcode.js';
import { PiDesktopAdapter } from '../src/adapters/pi-desktop.js';
import { parseFile, toRecord } from '../src/adapters/dsh.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('OpenChamberAdapter', () => {
  it('running→idle 产出 turn-completed（outcome 判成败）', async () => {
    const sid = 'ses_test1';
    const responses: Record<string, unknown> = {
      '/api/sessions/status': { sessions: { [sid]: { status: 'idle', lastUpdateAt: 2000 } } },
      '/api/session/active': { data: {} },
      [`/api/session/${sid}`]: { data: {
        id: sid, projectID: 'p1', agent: 'build',
        model: { id: 'glm-5.3', providerID: 'zai' },
        tokens: { input: 100, output: 50 },
        outcome: 'succeeded',
        time: { created: 1000, updated: 2000, idle: 2000 },
        title: '测试任务',
        metadata: { openchamber: { assist: { recap: '完成摘要' } } },
        location: { directory: 'E:\\www\\dsh-base' },
      } },
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL) => {
      const u = String(_url);
      const p = u.replace(/^https?:\/\/[^/]+/, '');
      const body = responses[p] ?? (p.startsWith('/api/session/') ? { data: {} } : {});
      return { ok: true, status: 200, json: async () => body };
    }));

    const a = new OpenChamberAdapter(57123);
    // 第一轮：首见基线（session-status，面板可见；通知由聚合器静默期吸收）
    const st: any = { sessions: { [sid]: { status: 'running', lastUpdateAt: 1500 } } };
    responses['/api/sessions/status'] = { sessions: { [sid]: { status: 'running', lastUpdateAt: 1500 } } };
    responses['/api/session/active'] = { data: { [sid]: { type: 'running' } } };
    const d1 = await a.poll();
    expect(d1.length).toBe(1);
    expect(d1[0]!.kind).toBe('session-status');
    expect(d1[0]!.to).toBe('running');
    expect(d1[0]!.record.title).toBe('测试任务');

    // 第二轮：转 idle → turn-completed
    responses['/api/sessions/status'] = { sessions: { [sid]: { status: 'idle', lastUpdateAt: 2000 } } };
    responses['/api/session/active'] = { data: {} };
    const d2 = await a.poll();
    expect(d2.length).toBe(1);
    expect(d2[0]!.kind).toBe('turn-completed');
    expect(d2[0]!.to).toBe('completed');
    expect(d2[0]!.record.projectName).toBe('dsh-base');
    expect(d2[0]!.record.lastAssistantExcerpt).toBe('完成摘要');
    expect(d2[0]!.turn?.tokens).toBe(150);
  });
});

describe('ZCodeAdapter', () => {
  it('running→completed 复查产出 turn-completed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-zcode-'));
    const dbFile = path.join(dir, 'db.sqlite');
    const db = new Database(dbFile);
    db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER, task_type TEXT);
      CREATE TABLE turn_usage (session_id TEXT, turn_id TEXT, status TEXT, started_at INTEGER, completed_at INTEGER, duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, computed_total_tokens INTEGER, error_code TEXT, error_type TEXT, cancelled_by_user INTEGER);`);
    db.prepare(`INSERT INTO session VALUES ('sess_1','p','D:\\www\\demo','标题A',100,200,'interactive')`).run();
    db.prepare(`INSERT INTO turn_usage VALUES ('sess_1','t1','running',500,null,null,0,0,0,null,null,0)`).run();
    db.close();

    const a = new ZCodeAdapter(dbFile);
    await a.start();
    const d1 = await a.poll();
    expect(d1.length).toBe(1);
    expect(d1[0]!.to).toBe('running');

    // 回合完成
    const db2 = new Database(dbFile);
    db2.prepare(`UPDATE turn_usage SET status='completed', completed_at=900, duration_ms=400, computed_total_tokens=1234 WHERE turn_id='t1'`).run();
    db2.close();
    const d2 = await a.poll();
    expect(d2.length).toBe(1);
    expect(d2[0]!.kind).toBe('turn-completed');
    expect(d2[0]!.to).toBe('completed');
    expect(d2[0]!.turn?.tokens).toBe(1234);
    expect(d2[0]!.record.projectName).toBe('demo');
    expect(d2[0]!.record.title).toBe('标题A');
    await a.stop();
  });
});

describe('PiDesktopAdapter', () => {
  it('error 回合带 errorCode，项目名解析', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-pi-'));
    const dbFile = path.join(dir, 'pi.sqlite');
    const db = new Database(dbFile);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, path TEXT, name TEXT);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, project_id INTEGER, model_id TEXT, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER);
      CREATE TABLE turns (id TEXT PRIMARY KEY, session_id TEXT, status TEXT DEFAULT 'running', model_id TEXT, error_code TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, started_at INTEGER, ended_at INTEGER);
      CREATE TABLE messages (mid INTEGER PRIMARY KEY, id TEXT, session_id TEXT, turn_id TEXT, seq INTEGER, role TEXT, tool_name TEXT, is_error INTEGER DEFAULT 0, text TEXT, created_at INTEGER, streaming INTEGER);`);
    db.prepare(`INSERT INTO projects VALUES (1, 'E:/www/dsh-base', 'dsh-base')`).run();
    db.prepare(`INSERT INTO sessions VALUES ('s1','错误回合测试',1,'glm',100,200,null)`).run();
    db.prepare(`INSERT INTO turns VALUES ('t1','s1','running','glm',null,0,0,500,null)`).run();
    db.prepare(`INSERT INTO messages VALUES (1,'m1','s1','t1',1,'assistant',null,0,'这是最后的回复',600,0)`).run();
    db.close();

    const a = new PiDesktopAdapter(dbFile);
    await a.start();
    await a.poll(); // 基线 running

    const db2 = new Database(dbFile);
    db2.prepare(`UPDATE turns SET status='error', ended_at=800, error_code='TIMEOUT', output_tokens=42 WHERE id='t1'`).run();
    db2.close();
    const d2 = await a.poll();
    expect(d2.length).toBe(1);
    expect(d2[0]!.kind).toBe('turn-completed');
    expect(d2[0]!.to).toBe('error');
    expect(d2[0]!.turn?.errorCode).toBe('TIMEOUT');
    expect(d2[0]!.record.projectName).toBe('dsh-base');
    expect(d2[0]!.record.lastAssistantExcerpt).toBe('这是最后的回复');
    await a.stop();
  });
});

describe('DSH 解析', () => {
  it('从 zstd jsonl 解析 cwd/turn/approval（用 python 预生成 fixture）', () => {
    const fixture = path.join(__dirname, 'fixtures', 'dsh-sample.v4.jsonl.zstd');
    if (!fs.existsSync(fixture)) {
      console.warn('跳过：fixture 未生成');
      return;
    }
    const parsed = parseFile(fixture);
    expect(parsed).not.toBeNull();
    expect(parsed!.cwd).toBe('E:\\www\\demo-project');
    expect(parsed!.v4).toBe(true);
    expect(parsed!.turns.some(t => t.status === 'completed')).toBe(true);
    const rec = toRecord('dsh', parsed!);
    expect(rec.projectName).toBe('demo-project');
  });

  it('文件不存在返回 null（ENOENT 降级）', () => {
    expect(parseFile('Z:/nonexistent/file.zstd')).toBeNull();
  });
});
