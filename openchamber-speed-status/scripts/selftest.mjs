// 对真实 opencode.db 跑数据层断言（v2 主路径 + v1 兜底）。node scripts/selftest.mjs
import { getDb, dbPath } from "../service/db.mjs";
import { buildStats, buildStatsV2 } from "../shared/stats.mjs";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? "  [ok] " : "  [FAIL] ") + msg); };

console.log("[selftest] db:", dbPath());
const { db } = getDb();

// ---- v2：最近更新的 session_v2 会话 ----
console.log("\n[v2] session_v2 最近活跃会话");
const v2 = db.prepare(
  "SELECT id, title, tokens_output, tokens_reasoning FROM session_v2 ORDER BY time_updated DESC LIMIT 1"
).get();
ok(!!v2, "找到 v2 会话: " + (v2?.id ?? "无"));
if (v2) {
  const rows = db.prepare(
    "SELECT seq, type, time_created, data FROM session_message WHERE session_id = ? ORDER BY seq DESC LIMIT 600"
  ).all(v2.id);
  const stats = buildStatsV2({ sessionRow: db.prepare("SELECT * FROM session_v2 WHERE id = ?").get(v2.id), msgRows: rows });
  ok(stats.session != null && stats.session.rounds > 0, `轮数 > 0（${stats.session?.rounds}）`);
  ok(stats.session.outTok === (v2.tokens_output + v2.tokens_reasoning), "会话输出 = 表内 output+reasoning");
  ok(stats.turn.requests > 0, `本轮请求数 ${stats.turn.requests}`);
  if (stats.turn.requests > 0) {
    ok(stats.turn.genMs > 0, `本轮纯生成时长 > 0（${Math.round(stats.turn.genMs)}ms）`);
    ok(stats.turn.outTok > 0, `本轮输出 token > 0（${stats.turn.outTok}）`);
    ok(stats.turn.tps == null || (stats.turn.tps > 0.05 && stats.turn.tps < 2000), `本轮 t/s 合理（${stats.turn.tps?.toFixed(1)}）`);
    ok(stats.turn.ttftLast == null || stats.turn.ttftLast >= 0, `TTFT ≥ 0（${stats.turn.ttftLast}ms）`);
    ok(stats.recent.length >= 0, `曲线样本 ${stats.recent.length}`);
    console.log("  [i] 本轮概要:", JSON.stringify({
      tps: stats.turn.tps && Math.round(stats.turn.tps * 10) / 10,
      ttft: stats.turn.ttftLast, genMs: Math.round(stats.turn.genMs), reqs: stats.turn.requests,
    }));
  }
}

// ---- v1：旧 session 表兜底 ----
console.log("\n[v1] session 表最近活跃会话（兜底路径）");
const v1 = db.prepare(
  "SELECT id, tokens_output, tokens_reasoning FROM session ORDER BY time_updated DESC LIMIT 1"
).get();
ok(!!v1, "找到 v1 会话: " + (v1?.id ?? "无"));
if (v1) {
  const msgRows = db.prepare(
    "SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created DESC, id DESC LIMIT 600"
  ).all(v1.id);
  const partsByMessage = new Map();
  const ids = msgRows.map((r) => r.id).slice(0, 50);
  const stmt = db.prepare("SELECT message_id, data FROM part WHERE message_id = ?");
  for (const id of ids) {
    const rows = stmt.all(id);
    if (rows.length) partsByMessage.set(id, rows);
  }
  const userMsgCount = db.prepare(
    "SELECT COUNT(*) AS n FROM message WHERE session_id = ? AND json_extract(data,'$.role')='user'"
  ).get(v1.id)?.n ?? 0;
  const sessionRow = db.prepare("SELECT * FROM session WHERE id = ?").get(v1.id);
  const stats = buildStats({ sessionRow, messageRows: msgRows, partsByMessage, toolStats: { n: 0, err: 0 }, userMsgCount });
  ok(stats.session != null, "v1 session 聚合存在");
  ok(stats.session.outTok === (v1.tokens_output + v1.tokens_reasoning), "v1 会话输出 = 表内 output+reasoning");
}

if (fails.length) { console.error(`[selftest] FAILED: ${fails.length}`); process.exit(1); }
console.log("\n[selftest] all passed");
