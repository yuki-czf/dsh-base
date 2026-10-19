/*
 * PI Statusbar — plugin host (main) side.
 *
 * Answers the renderer strip's "statusbar" call with the DSH/ZCode-口径
 * snapshot computed from the official read-only usage contract
 * (`pi.usage.listTurns`, permission usage.read):
 *
 *   decode window = responseDurationMs − firstTokenMs      (per model call)
 *   generated     = outputTokens (+ reasoningTokens when the relay reports
 *                   reasoning separately, i.e. reasoningTokens > outputTokens)
 *   TPS           = Σ generated ÷ (Σ decode window / 1000)  (pooled, ≥250 ms)
 *
 * A call without a first-token timestamp never contributes its duration to a
 * pooled decode rate (it would dilute it with TTFT); its tokens still count
 * toward the token totals. A 1 s snapshot cache keeps the strip gentle.
 *
 * Privacy: counters and identifiers only. No message bodies, no network.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 1000;
const WINDOW_DAYS = 7;
const LIMIT = 300;
const MIN_DECODE_MS = 250;

let cache = null;
let cacheAt = 0;
let inflight = null;
let contractLogged = false;

function firstOf(source, keys) {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function countOf(...values) {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return 0;
}

function textOf(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function turnsFrom(page) {
  if (Array.isArray(page)) return page;
  if (!page || typeof page !== "object") return [];
  for (const key of ["turns", "items", "rows", "records", "data", "entries", "list"]) {
    if (Array.isArray(page[key])) return page[key];
  }
  return [];
}

function normalizeTurn(raw) {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw.usage && typeof raw.usage === "object" ? raw.usage : {};
  const startedAt = asNumber(firstOf(raw, ["startedAt", "started_at"]));
  const endedAt = asNumber(firstOf(raw, ["endedAt", "ended_at"]));
  const outputTokens = countOf(firstOf(raw, ["outputTokens", "output_tokens"]), usage.outputTokens);
  const reasoningTokens = countOf(firstOf(raw, ["reasoningTokens", "reasoning_tokens"]), usage.reasoningTokens);
  let firstTokenMs = asNumber(firstOf(raw, ["firstTokenMs", "first_token_ms", "responseFirstTokenMs"]));
  if (firstTokenMs === null) firstTokenMs = asNumber(usage.firstTokenMs);
  const durationMs = startedAt !== null && endedAt !== null && endedAt > startedAt ? endedAt - startedAt : null;
  // DSH/ZCode numerator: all tokens the model actually generated. Their
  // outputTokens includes reasoning; relays that report reasoning separately
  // (reasoningTokens > outputTokens) must have it added back on top.
  const generatedTokens = outputTokens + (reasoningTokens > outputTokens ? reasoningTokens : 0);
  const decodeMs =
    durationMs !== null && firstTokenMs !== null && firstTokenMs >= 0 && firstTokenMs < durationMs
      ? durationMs - firstTokenMs
      : durationMs;
  return {
    sessionId: textOf(firstOf(raw, ["sessionId", "session_id"])),
    turnId: textOf(firstOf(raw, ["turnId", "turn_id"])),
    modelId: textOf(firstOf(raw, ["modelId", "model_id"])),
    startedAt,
    endedAt,
    durationMs,
    firstTokenMs, // null = unknown (stock host); 0 = whole-payload channel (valid)
    decodeMs,
    outputTokens,
    reasoningTokens,
    generatedTokens,
  };
}

function rate(gen, decodeMs) {
  if (decodeMs === null || decodeMs === undefined || decodeMs < MIN_DECODE_MS || !(gen > 0)) return null;
  return Math.round(gen / (decodeMs / 1000));
}

async function compute() {
  const toMs = Date.now();
  const page = await pi.usage.listTurns({ fromMs: toMs - WINDOW_DAYS * DAY_MS, toMs, limit: LIMIT });
  const rawRows = turnsFrom(page);
  // One-time contract probe: does listTurns carry the first-token timing at
  // all? Written to the host log so a persistent ⚡-- has an obvious cause.
  if (!contractLogged && rawRows.length > 0) {
    contractLogged = true;
    try {
      const first = rawRows[0];
      const usageKeys = first && first.usage && typeof first.usage === "object" ? Object.keys(first.usage) : [];
      console.log(
        "[pi-statusbar] contract:",
        JSON.stringify({
          rowKeys: Object.keys(first),
          usageKeys,
          hasFirstTokenMs:
            first.firstTokenMs !== undefined ||
            first.first_token_ms !== undefined ||
            usageKeys.includes("firstTokenMs"),
        }),
      );
    } catch {
      // diagnostics never break the snapshot
    }
  }
  const rows = rawRows
    .map(normalizeTurn)
    .filter((t) => t && t.endedAt !== null)
    .sort((a, b) => a.endedAt - b.endedAt);
  const latest = rows.length ? rows[rows.length - 1] : null;

  const decodeValid = (t) => t.firstTokenMs !== null && t.decodeMs !== null && t.decodeMs >= MIN_DECODE_MS;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const today = { gen: 0, calls: 0 };
  let todayDecodeMs = 0;
  let todayGenDecode = 0;
  for (const t of rows) {
    if (t.startedAt !== null && t.startedAt >= dayStartMs) {
      today.gen += t.generatedTokens;
      today.calls += 1;
      if (decodeValid(t)) {
        todayDecodeMs += t.decodeMs;
        todayGenDecode += t.generatedTokens;
      }
    }
  }

  // Current turn: same turnId as the latest call (fallback: same session and
  // started within 10 minutes of it).
  let turn = null;
  if (latest) {
    const turnRows = rows.filter((t) => {
      if (t.endedAt === null) return false;
      if (t.turnId && latest.turnId) return t.turnId === latest.turnId && t.sessionId === latest.sessionId;
      if (t.sessionId !== latest.sessionId) return false;
      return (
        t.startedAt !== null &&
        latest.startedAt !== null &&
        Math.abs(t.startedAt - latest.startedAt) < 10 * 60 * 1000
      );
    });
    let gen = 0;
    let decode = 0;
    let decodeGen = 0;
    let firstRow = null;
    for (const t of turnRows) {
      gen += t.generatedTokens;
      if (firstRow === null || (t.startedAt !== null && (firstRow.startedAt === null || t.startedAt < firstRow.startedAt))) {
        firstRow = t;
      }
      if (decodeValid(t)) {
        decode += t.decodeMs;
        decodeGen += t.generatedTokens;
      }
    }
    turn = {
      gen,
      decodeTps: rate(decodeGen, decode),
      ttftMs: firstRow && firstRow.firstTokenMs !== null ? firstRow.firstTokenMs : null,
      calls: turnRows.length,
    };
  }

  // Session pool (the latest session).
  let session = null;
  if (latest && latest.sessionId) {
    let gen = 0;
    let decode = 0;
    let decodeGen = 0;
    let calls = 0;
    for (const t of rows) {
      if (t.sessionId !== latest.sessionId) continue;
      calls += 1;
      gen += t.generatedTokens;
      if (decodeValid(t)) {
        decode += t.decodeMs;
        decodeGen += t.generatedTokens;
      }
    }
    session = { gen, calls, decodeTps: rate(decodeGen, decode) };
  }

  const latestView = latest
    ? {
        tps: decodeValid(latest) ? rate(latest.generatedTokens, latest.decodeMs) : null,
        hasTtft: latest.firstTokenMs !== null,
        ttftMs: latest.firstTokenMs,
        e2eMs: latest.durationMs,
        gen: latest.generatedTokens,
        outputTokens: latest.outputTokens,
        reasoningTokens: latest.reasoningTokens,
        modelId: latest.modelId,
        endedAt: latest.endedAt,
        sessionId: latest.sessionId,
      }
    : null;

  return {
    at: Date.now(),
    latest: latestView,
    turn,
    session,
    today: { gen: today.gen, calls: today.calls, decodeTps: rate(todayGenDecode, todayDecodeMs) },
  };
}

async function getSnapshot() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  if (inflight) return inflight;
  inflight = compute()
    .then((snapshot) => {
      cache = snapshot;
      cacheAt = Date.now();
      inflight = null;
      return snapshot;
    })
    .catch((error) => {
      inflight = null;
      return { error: error && error.message ? error.message : String(error) };
    });
  return inflight;
}

function describe(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "PI Statusbar: 暂无数据。";
  if (snapshot.error) return `PI Statusbar: ${snapshot.error}`;
  const l = snapshot.latest ?? {};
  const turn = snapshot.turn ?? {};
  const session = snapshot.session ?? {};
  const today = snapshot.today ?? {};
  const parts = [];
  parts.push(
    l.tps !== null && l.tps !== undefined
      ? `最近一次解码 ${l.tps} tok/s`
      : l.endedAt !== null && l.endedAt !== undefined
        ? "最近一次无首字时刻，解码速度不显示"
        : "尚无完成的模型请求",
  );
  if (l.ttftMs !== null && l.ttftMs !== undefined) parts.push(`首字 ${(l.ttftMs / 1000).toFixed(1)}s`);
  if (l.modelId) parts.push(l.modelId);
  if (turn.calls) parts.push(`本轮 ${turn.calls} 次 / ${turn.gen} tok`);
  if (session.calls) parts.push(`会话 ${session.calls} 次 / ${session.gen} tok`);
  if (today.calls) parts.push(`今日 ${today.calls} 次 / ${today.gen} tok`);
  parts.push("口径 = DSH/ZCode：Σ生成token（含推理）÷ Σ(时长−首字)，≥250ms");
  return `PI Statusbar: ${parts.join(" · ")}`;
}

async function showExplain() {
  try {
    const snapshot = await getSnapshot();
    await pi.ui.showToast(describe(snapshot).slice(0, 480), "info");
  } catch (error) {
    await pi.ui.showToast(`PI Statusbar: ${error && error.message ? error.message : "读取失败"}`, "error").catch(() => {});
  }
}

async function onLoad() {
  await pi.commands.register({
    id: "pi-statusbar.explain",
    title: "PI Statusbar: 速度明细",
    keywords: ["statusbar", "speed", "tps", "ttft", "状态条", "速度", "生成速度"],
    run: showExplain,
  });
}

async function onUnload() {
  try {
    if (typeof pi !== "undefined" && pi && pi.commands) await pi.commands.unregister("pi-statusbar.explain");
  } catch {
    // host may have already torn the command registry down
  }
}

async function onRendererCall(method, args) {
  if (method === "statusbar") return getSnapshot();
  if (method === "report") {
    console.log(`[pi-statusbar] geom: ${JSON.stringify(args ?? {})}`);
    return { ok: true };
  }
  throw new Error(`pi-statusbar: unknown renderer call "${method}"`);
}

module.exports = { onLoad, onUnload, onRendererCall };
