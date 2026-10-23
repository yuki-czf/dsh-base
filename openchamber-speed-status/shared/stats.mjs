// 纯函数：opencode v2（session_v2 + session_message）与 v1（session+message+part）
// 两条路径的行 → 统一速度指标。不做 I/O。
//
// 口径（照 zcode-token-usage-statusbar）：
//   一轮 = 会话内最后一条 user 消息之后的所有 assistant 消息（每条 = 一次模型请求）
//   TTFT = 首 token 时刻 − 请求开始（v2 直接给 time.streamed；v1 用 min(part.start)）
//   纯生成时长 = Σ 文本/思考段的 (结束−开始)，工具等待天然剔除
//   t/s = (output + reasoning tokens) ÷ 纯生成时长（opencode 的 output 不含 reasoning）
//   缓存命中率 = cacheRead ÷ (input + cacheRead + cacheWrite)

// ---------- v2 ----------

export function parseV2Message(row) {
  const d = JSON.parse(row.data);
  const content = Array.isArray(d.content) ? d.content : [];
  return {
    seq: row.seq,
    type: row.type,
    created: d.time?.created ?? row.time_created,
    streamed: d.time?.streamed ?? null,
    completed: d.time?.completed ?? null,
    model: d.model?.id ?? null,
    provider: d.model?.providerID ?? null,
    output: d.tokens?.output ?? 0,
    reasoning: d.tokens?.reasoning ?? 0,
    input: d.tokens?.input ?? 0,
    cacheRead: d.tokens?.cache?.read ?? 0,
    cacheWrite: d.tokens?.cache?.write ?? 0,
    cost: d.cost ?? 0,
    content,
  };
}

// 单条 assistant 消息 = 一次模型请求
export function requestStatsV2(msg) {
  const gen = msg.content.filter((c) => c.type === "text" || c.type === "reasoning");
  const starts = gen.map((c) => c.time?.created).filter((v) => typeof v === "number");
  const firstContent = starts.length ? Math.min(...starts) : null;

  let decodeMs = 0;
  let precise = true;
  for (const c of gen) {
    if (typeof c.time?.created === "number" && typeof c.time?.completed === "number") {
      decodeMs += Math.max(0, c.time.completed - c.time.created);
    }
  }
  if (decodeMs <= 0) {
    // 退化为 streamed→completed（有 streamed 时它就是首字）
    if (msg.completed != null && msg.streamed != null) decodeMs = Math.max(0, msg.completed - msg.streamed);
    else if (msg.completed != null && firstContent != null) decodeMs = Math.max(0, msg.completed - firstContent);
    precise = false;
  }

  const ttftMs =
    msg.streamed != null ? Math.max(0, msg.streamed - msg.created)
    : firstContent != null ? Math.max(0, firstContent - msg.created)
    : null;

  const tools = msg.content.filter((c) => c.type === "tool");
  const toolErrors = tools.filter((c) => c.state?.status === "error").length;

  const outTok = (msg.output ?? 0) + (msg.reasoning ?? 0);
  return {
    id: `seq_${msg.seq}`,
    model: msg.model,
    provider: msg.provider,
    started: msg.created,
    completed: msg.completed,
    running: msg.completed == null,
    ttftMs,
    decodeMs,
    precise,
    outTok,
    inTok: (msg.input ?? 0) + (msg.cacheRead ?? 0) + (msg.cacheWrite ?? 0),
    cacheRead: msg.cacheRead ?? 0,
    cost: msg.cost ?? 0,
    tps: decodeMs > 0 ? outTok / (decodeMs / 1000) : null,
    toolCalls: tools.length,
    toolErrors,
  };
}

export function buildStatsV2({ sessionRow, msgRows }) {
  const msgs = msgRows.map(parseV2Message); // seq DESC
  const userCount = msgs.filter((m) => m.type === "user").length;

  // 本轮 = 最后一条 user 消息之后的 assistant 消息
  let lastUserSeq = -Infinity;
  for (const m of msgs) { if (m.type === "user") { lastUserSeq = m.seq; break; } }
  const turnMsgs = msgs.filter((m) => m.type === "assistant" && m.seq > lastUserSeq).reverse(); // ASC

  const allReqs = msgs.filter((m) => m.type === "assistant").map(requestStatsV2);
  const turnReqs = turnMsgs.map(requestStatsV2);
  const turn = aggregateReq(turnReqs);
  const last = turnReqs.length ? turnReqs[turnReqs.length - 1] : null;
  const recent = allReqs.filter((r) => !r.running && r.tps != null).slice(0, 24)
    .map((r) => ({ tps: r.tps, ttftMs: r.ttftMs, completed: r.completed, model: r.model }));

  const tools = allReqs.reduce((a, r) => ({ calls: a.calls + (r.toolCalls ?? 0), errors: a.errors + (r.toolErrors ?? 0) }), { calls: 0, errors: 0 });
  // 扫描窗口外的工具数补上（只有总数，没有错误拆分）
  const scannedAssistant = msgs.filter((m) => m.type === "assistant").length;

  const sess = sessionRow
    ? {
        title: sessionRow.title,
        directory: sessionRow.directory,
        inTok: (sessionRow.tokens_input ?? 0) + (sessionRow.tokens_cache_read ?? 0) + (sessionRow.tokens_cache_write ?? 0),
        outTok: (sessionRow.tokens_output ?? 0) + (sessionRow.tokens_reasoning ?? 0),
        cacheRead: sessionRow.tokens_cache_read ?? 0,
        cost: sessionRow.cost ?? 0,
        rounds: userCount,
        updated: sessionRow.time_updated,
      }
    : null;
  if (sess) sess.hitRate = sess.inTok > 0 ? sess.cacheRead / sess.inTok : null;

  return {
    flavor: "v2",
    session: sess,
    turn: {
      requests: turn.requests,
      running: turnReqs.some((r) => r.running),
      genMs: turn.genMs,
      outTok: turn.outTok,
      inTok: turn.inTok,
      hitRate: turn.inTok > 0 ? turn.cacheRead / turn.inTok : null,
      tps: turn.tps,
      ttftLast: turn.ttftLast,
      ttftAvg: turn.ttftAvg,
      precise: turnReqs.every((r) => r.precise),
    },
    last,
    recent,
    models: byModel(allReqs),
    tools: { ...tools, scannedAssistant },
  };
}

// ---------- 共用聚合 ----------

export function aggregateReq(reqs) {
  const sum = (fn) => reqs.reduce((a, r) => a + (fn(r) || 0), 0);
  const genMs = sum((r) => r.decodeMs);
  const outTok = sum((r) => r.outTok);
  const ttfts = reqs.map((r) => r.ttftMs).filter((v) => v != null);
  return {
    requests: reqs.length,
    genMs,
    outTok,
    inTok: sum((r) => r.inTok),
    cacheRead: sum((r) => r.cacheRead),
    cost: sum((r) => r.cost),
    tps: genMs > 0 ? outTok / (genMs / 1000) : null,
    ttftLast: ttfts.length ? ttfts[ttfts.length - 1] : null,
    ttftAvg: ttfts.length ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null,
  };
}

export function byModel(reqs, cap = 200) {
  const map = new Map();
  for (const r of reqs.slice(0, cap)) {
    const key = `${r.provider ?? "?"}/${r.model ?? "?"}`;
    if (!map.has(key)) map.set(key, { model: key, requests: 0, outTok: 0, genMs: 0, ttfts: [] });
    const m = map.get(key);
    m.requests += 1;
    m.outTok += r.outTok;
    m.genMs += r.decodeMs;
    if (r.ttftMs != null) m.ttfts.push(r.ttftMs);
  }
  return [...map.values()].map((m) => ({
    model: m.model,
    requests: m.requests,
    outTok: m.outTok,
    tps: m.genMs > 0 ? m.outTok / (m.genMs / 1000) : null,
    ttftAvg: m.ttfts.length ? m.ttfts.reduce((a, b) => a + b, 0) / m.ttfts.length : null,
  })).sort((a, b) => b.requests - a.requests);
}

// ---------- v1（旧会话兜底） ----------

export function parseMessage(row) {
  const d = JSON.parse(row.data);
  return {
    id: row.id,
    role: d.role ?? "",
    modelID: d.modelID ?? null,
    providerID: d.providerID ?? null,
    created: d.time?.created ?? row.time_created,
    completed: d.time?.completed ?? null,
    output: d.tokens?.output ?? 0,
    reasoning: d.tokens?.reasoning ?? 0,
    input: d.tokens?.input ?? 0,
    cacheRead: d.tokens?.cache?.read ?? 0,
    cacheWrite: d.tokens?.cache?.write ?? 0,
    cost: d.cost ?? 0,
  };
}

export function parsePart(row) {
  const d = JSON.parse(row.data);
  return {
    id: row.id,
    messageId: row.message_id,
    type: d.type ?? "",
    start: d.time?.start ?? null,
    end: d.time?.end ?? null,
    status: d.state?.status ?? null,
  };
}

export function requestStats(msg, partRows) {
  const parts = (partRows ?? []).map(parsePart);
  const genParts = parts.filter((p) => p.type === "text" || p.type === "reasoning");
  const starts = genParts.map((p) => p.start).filter((v) => typeof v === "number");
  const firstToken = starts.length ? Math.min(...starts) : null;

  let decodeMs = 0;
  let precise = true;
  for (const p of genParts) {
    if (typeof p.start === "number" && typeof p.end === "number" && p.end >= p.start) {
      decodeMs += p.end - p.start;
    }
  }
  if (decodeMs <= 0 && msg.completed != null && firstToken != null) {
    decodeMs = Math.max(0, msg.completed - firstToken);
    precise = false;
  }
  const outTok = (msg.output ?? 0) + (msg.reasoning ?? 0);
  return {
    id: msg.id,
    model: msg.modelID,
    provider: msg.providerID,
    started: msg.created,
    completed: msg.completed,
    running: msg.completed == null,
    ttftMs: firstToken != null ? Math.max(0, firstToken - msg.created) : null,
    decodeMs,
    precise,
    outTok,
    inTok: (msg.input ?? 0) + (msg.cacheRead ?? 0) + (msg.cacheWrite ?? 0),
    cacheRead: msg.cacheRead ?? 0,
    cost: msg.cost ?? 0,
    tps: decodeMs > 0 ? outTok / (decodeMs / 1000) : null,
    toolCalls: parts.filter((p) => p.type === "tool").length,
    toolErrors: parts.filter((p) => p.type === "tool" && p.status === "error").length,
  };
}

export function buildStats({ sessionRow, messageRows, partsByMessage, toolStats, userMsgCount }) {
  const msgs = messageRows.map(parseMessage); // DESC
  const userCount = userMsgCount ?? msgs.filter((m) => m.role === "user").length;

  let turnStartIdx = 0;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "user") { turnStartIdx = i; break; }
  }
  const turnMsgs = msgs.slice(0, turnStartIdx).filter((m) => m.role === "assistant").reverse();

  const allReqs = msgs.filter((m) => m.role === "assistant")
      .map((m) => requestStats(m, partsByMessage.get(m.id) ?? []));
  const turnReqs = turnMsgs.map((m) => requestStats(m, partsByMessage.get(m.id) ?? []));
  const turn = aggregateReq(turnReqs);
  const last = turnReqs.length ? turnReqs[turnReqs.length - 1] : null;
  const recent = allReqs.filter((r) => !r.running && r.tps != null).slice(0, 24)
    .map((r) => ({ tps: r.tps, ttftMs: r.ttftMs, completed: r.completed, model: r.model }));
  const models = byModel(allReqs);

  const sess = sessionRow
    ? {
        title: sessionRow.title,
        directory: sessionRow.directory,
        inTok: (sessionRow.tokens_input ?? 0) + (sessionRow.tokens_cache_read ?? 0) + (sessionRow.tokens_cache_write ?? 0),
        outTok: (sessionRow.tokens_output ?? 0) + (sessionRow.tokens_reasoning ?? 0),
        cacheRead: sessionRow.tokens_cache_read ?? 0,
        cost: sessionRow.cost ?? 0,
        rounds: userCount,
        updated: sessionRow.time_updated,
      }
    : null;
  if (sess) sess.hitRate = sess.inTok > 0 ? sess.cacheRead / sess.inTok : null;

  const tools = allReqs.reduce((a, r) => ({ calls: a.calls + (r.toolCalls ?? 0), errors: a.errors + (r.toolErrors ?? 0) }), { calls: 0, errors: 0 });

  return {
    flavor: "v1",
    session: sess,
    turn: {
      requests: turn.requests,
      running: turnReqs.some((r) => r.running),
      genMs: turn.genMs,
      outTok: turn.outTok,
      inTok: turn.inTok,
      hitRate: turn.inTok > 0 ? turn.cacheRead / turn.inTok : null,
      tps: turn.tps,
      ttftLast: turn.ttftLast,
      ttftAvg: turn.ttftAvg,
      precise: turnReqs.every((r) => r.precise),
    },
    last,
    recent,
    models,
    tools: { ...tools, sessionTotal: toolStats?.n ?? null },
  };
}
