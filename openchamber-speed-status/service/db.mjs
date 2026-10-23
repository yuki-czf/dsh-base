// 只读访问 opencode.db（opencode 2.x）。
// v2 会话在 session_v2 + session_message（自带 time.streamed = 首字时间）；
// 旧会话在 session + message + part（v1 格式）。两条路径都保留。
// 全部查询按 session_id / seq / message_id 走索引，禁止无过滤全表 json_extract。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function dbPath() {
  if (process.env.OPENCODE_DB && process.env.OPENCODE_DB.trim()) {
    return path.resolve(process.env.OPENCODE_DB.trim());
  }
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");
}

export function openDb() {
  const p = dbPath();
  if (!fs.existsSync(p)) throw new Error(`opencode.db not found: ${p}`);
  return { db: new DatabaseSync(p, { readOnly: true }), path: p };
}

let cached = null;
export function getDb() {
  if (!cached) cached = openDb();
  return cached;
}

// ---- v2：session_v2 + session_message ----
const Q_V2_SESSION = `
  SELECT id, title, directory, tokens_input, tokens_output, tokens_reasoning,
         tokens_cache_read, tokens_cache_write, cost, time_created, time_updated
  FROM session_v2 WHERE id = ?`;

const Q_V2_MESSAGES_DESC = `
  SELECT seq, type, time_created, data FROM session_message
  WHERE session_id = ? ORDER BY seq DESC LIMIT ?`;

const Q_V2_EXISTS = `SELECT 1 AS x FROM session_v2 WHERE id = ?`;

// ---- v1（旧会话兜底）：session + message + part ----
const Q_V1_SESSION = `
  SELECT id, title, directory, tokens_input, tokens_output, tokens_reasoning,
         tokens_cache_read, tokens_cache_write, cost, time_created, time_updated
  FROM session WHERE id = ?`;

const Q_V1_MESSAGES_DESC = `
  SELECT id, time_created, data FROM message
  WHERE session_id = ? ORDER BY time_created DESC, id DESC LIMIT ?`;

const Q_V1_USER_COUNT = `
  SELECT COUNT(*) AS n FROM message
  WHERE session_id = ? AND json_extract(data, '$.role') = 'user'`;

const Q_V1_TOOL_STATS = `
  SELECT COUNT(*) AS n,
         SUM(CASE WHEN json_extract(data,'$.state.status') = 'error' THEN 1 ELSE 0 END) AS err
  FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'tool'`;

const Q_V1_PARTS = `SELECT message_id, data FROM part WHERE message_id = ?`;

/** 返回 { flavor: "v2" | "v1" | null, ... } */
export function queryStats(db, sessionId, { scanLimit = 600 } = {}) {
  const v2 = db.prepare(Q_V2_EXISTS).get(sessionId);
  if (v2) return queryV2(db, sessionId, scanLimit);

  const v1 = db.prepare("SELECT 1 AS x FROM session WHERE id = ?").get(sessionId);
  if (v1) return { flavor: "v1", ...queryV1(db, sessionId, scanLimit) };

  return { flavor: null };
}

function queryV2(db, sessionId, scanLimit) {
  const sessionRow = db.prepare(Q_V2_SESSION).get(sessionId) ?? null;
  const msgRows = db.prepare(Q_V2_MESSAGES_DESC).all(sessionId, scanLimit);
  return { flavor: "v2", sessionRow, msgRows };
}

function queryV1(db, sessionId, scanLimit) {
  const sessionRow = db.prepare(Q_V1_SESSION).get(sessionId) ?? null;
  const msgRows = db.prepare(Q_V1_MESSAGES_DESC).all(sessionId, scanLimit);
  const userMsgCount = db.prepare(Q_V1_USER_COUNT).get(sessionId)?.n ?? 0;
  const toolStats = db.prepare(Q_V1_TOOL_STATS).get(sessionId) ?? { n: 0, err: 0 };

  let lastUserIdx = -1;
  for (let i = 0; i < msgRows.length; i++) {
    if (JSON.parse(msgRows[i].data).role === "user") { lastUserIdx = i; break; }
  }
  const turnIds = [];
  if (lastUserIdx >= 0) {
    for (let i = 0; i < lastUserIdx; i++) {
      if (JSON.parse(msgRows[i].data).role === "assistant") turnIds.push(msgRows[i].id);
    }
  }
  const partsByMessage = new Map();
  const stmt = db.prepare(Q_V1_PARTS);
  for (const id of turnIds) {
    const rows = stmt.all(id);
    if (rows.length) partsByMessage.set(id, rows);
  }
  return { sessionRow, messageRows: msgRows, partsByMessage, toolStats, userMsgCount };
}
