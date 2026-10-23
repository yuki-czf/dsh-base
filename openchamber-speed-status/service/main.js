// oc-speed-status host service
// 约定与 live-tps 相同：OpenChamber 注入 OPENCHAMBER_SERVICE_PORT / OPENCHAMBER_SERVICE_TOKEN，
// 只监听 127.0.0.1，校验 Bearer token。
//
// 路由：
//   GET /health              → { ok, db, version }
//   GET /stats?sessionId=xx  → 计算好的速度指标（1.5s 进程内缓存）
import http from "node:http";
import { getDb, dbPath, queryStats } from "./db.mjs";
import { buildStats, buildStatsV2 } from "../shared/stats.mjs";

const VERSION = "0.4.0";
const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";

if (!Number.isInteger(port) || port <= 0 || !token) {
  console.error("[speed-status] OPENCHAMBER_SERVICE_PORT / OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}

const CACHE_TTL_MS = 1500;
const cache = new Map(); // sessionId -> { at, payload }

function computeStats(sessionId) {
  const hit = cache.get(sessionId);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.payload;
  try {
    const { db } = getDb();
    const raw = queryStats(db, sessionId);
    let payload;
    if (raw.flavor === "v2") payload = { ok: true, sessionId, ...buildStatsV2(raw) };
    else if (raw.flavor === "v1") payload = { ok: true, sessionId, ...buildStats(raw) };
    else payload = { ok: false, error: "session not found" };
    cache.set(sessionId, { at: now, payload });
    return payload;
  } catch (err) {
    const payload = { ok: false, error: String(err?.message ?? err) };
    cache.set(sessionId, { at: now, payload });
    return payload;
  }
}

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  // /health 必须在鉴权之前：宿主不带头就来探测，拿不到 200 会判定 SERVICE_FAILED。
  if (req.method === "GET" && url.pathname === "/health") {
    let dbOk = true;
    try { getDb(); } catch { dbOk = false; }
    return send(res, 200, { ok: dbOk, service: "speed-status", version: VERSION, db: dbPath() });
  }

  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method not allowed" });

  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${token}`) return send(res, 401, { ok: false, error: "unauthorized" });

  if (url.pathname === "/stats") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return send(res, 400, { ok: false, error: "sessionId required" });
    return send(res, 200, computeStats(sessionId));
  }

  return send(res, 404, { ok: false, error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[speed-status] ready on 127.0.0.1:${port}, db=${dbPath()}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { try { server.close(); } catch {} process.exit(0); });
}
