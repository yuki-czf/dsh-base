import { SidecarApp } from 'sidecar_sdk';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { startDeckInjector } from './deck_injector.mjs';

const CONV_DIR = join(homedir(), '.gemini', 'antigravity', 'conversations');

let cachedQuotaGroups = null;
let lastQuotaFetchMs = 0;
let lsConnFailures = 0;
const QUOTA_TTL_MS = 10000;

async function fetchQuotaGroups() {
  const now = Date.now();
  if (cachedQuotaGroups && now - lastQuotaFetchMs < QUOTA_TTL_MS) {
    return cachedQuotaGroups;
  }
  const lsAddr = process.env.ANTIGRAVITY_LS_ADDRESS;
  const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN;
  if (!lsAddr || !csrf) return cachedQuotaGroups || [];
  try {
    const res = await fetch(
      `http://${lsAddr}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrf,
        },
        body: '{}',
      }
    );
    lsConnFailures = 0;
    if (!res.ok) return cachedQuotaGroups || [];
    const data = await res.json();
    const groups = data?.response?.groups || data?.groups || [];
    cachedQuotaGroups = groups;
    lastQuotaFetchMs = now;
    return groups;
  } catch {
    lsConnFailures++;
    if (lsConnFailures >= 2) {
      process.exit(0);
    }
    return cachedQuotaGroups || [];
  }
}

function readVarint(buf, offset) {
  let val = 0n;
  let shift = 0n;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++];
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return [Number(val), i];
    }
    shift += 7n;
  }
  return [Number(val), i];
}

function parsePbMap(buf) {
  const fields = new Map();
  let i = 0;
  while (i < buf.length) {
    try {
      const [tag, nextI] = readVarint(buf, i);
      i = nextI;
      const fn = tag >>> 3;
      const wt = tag & 7;
      if (fn === 0) break;
      if (!fields.has(fn)) fields.set(fn, []);
      if (wt === 0) {
        const [val, nI] = readVarint(buf, i);
        i = nI;
        fields.get(fn).push(val);
      } else if (wt === 2) {
        const [len, nI] = readVarint(buf, i);
        i = nI;
        if (len < 0 || i + len > buf.length) break;
        fields.get(fn).push(buf.subarray(i, i + len));
        i += len;
      } else if (wt === 5) {
        fields.get(fn).push(buf.subarray(i, i + 4));
        i += 4;
      } else if (wt === 1) {
        fields.get(fn).push(buf.subarray(i, i + 8));
        i += 8;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return fields;
}

function parseGenRow(idx, data) {
  if (!data || !Buffer.isBuffer(data)) data = Buffer.from(data || []);
  const top = parsePbMap(data);
  if (!top.has(1)) return null;
  const m1 = parsePbMap(top.get(1)[0]);
  const usageBuf = m1.has(4) ? m1.get(4)[0] : Buffer.alloc(0);
  const usage = parsePbMap(usageBuf);

  const uncachedIn = usage.has(2) ? usage.get(2)[0] : 0;
  const cachedIn = usage.has(5) ? usage.get(5)[0] : 0;
  const thinkTokens = usage.has(9) ? usage.get(9)[0] : 0;
  const outTokens = usage.has(10) ? usage.get(10)[0] : 0;
  const contextTokens = uncachedIn + cachedIn;

  let maxContextTokens = 0;
  if (m1.has(9)) {
    const m9 = parsePbMap(m1.get(9)[0]);
    if (m9.has(10)) {
      const m10 = parsePbMap(m9.get(10)[0]);
      if (m10.has(4)) {
        maxContextTokens = m10.get(4)[0];
      }
    }
  }

  let lastStepIndex = -1;
  if (m1.has(20)) {
    for (const kvBuf of m1.get(20)) {
      const kv = parsePbMap(kvBuf);
      const key = kv.has(1) ? kv.get(1)[0].toString('utf8') : '';
      if (key === 'last_step_index' && kv.has(2)) {
        const n = Number(kv.get(2)[0].toString('utf8'));
        if (Number.isFinite(n)) lastStepIndex = n;
        break;
      }
    }
  }

  return {
    turn: idx,
    uncachedIn,
    cachedIn,
    contextTokens,
    outTokens,
    thinkTokens,
    maxContextTokens,
    lastStepIndex,
  };
}

let lastDeckConvId = null; // '' when on New Conversation page, or uuid when on /c/<uuid>

function resolveLatestConvId(preferredId) {
  if (!existsSync(CONV_DIR)) return '';
  const files = readdirSync(CONV_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({
      id: basename(f, '.db'),
      mtimeMs: statSync(join(CONV_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (files.length === 0) return '';
  // Always follow the most recently modified conversation DB so switching
  // or starting a new chat in Desktop automatically updates the panel.
  return files[0].id;
}

async function makeEmptyContextResult() {
  return {
    uiVersion: 19,
    cachedIn: 0,
    uncachedIn: 0,
    contextTokens: 0,
    maxContextTokens: 256000,
    lastStepEpochMs: 0,
    turn0Tokens: 0,
    totalOutputTokens: 0,
    totalThinkingTokens: 0,
    quotaGroups: await fetchQuotaGroups(),
  };
}

async function inspectConversation(convId, exact = false) {
  let targetId = '';
  if (exact) {
    lastDeckConvId = convId || '';
    if (!convId || !existsSync(join(CONV_DIR, `${convId}.db`))) {
      return await makeEmptyContextResult();
    }
    targetId = convId;
  } else {
    if (lastDeckConvId !== null) {
      if (!lastDeckConvId || !existsSync(join(CONV_DIR, `${lastDeckConvId}.db`))) {
        return await makeEmptyContextResult();
      }
      targetId = lastDeckConvId;
    } else {
      targetId =
        convId && existsSync(join(CONV_DIR, `${convId}.db`))
          ? convId
          : resolveLatestConvId(convId);
    }
    if (!targetId) {
      return await makeEmptyContextResult();
    }
  }

  const dbPath = join(CONV_DIR, `${targetId}.db`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let rawRows = [];
  let cpRows = [];
  let lastStepEpochMs = 0;
  try {
    rawRows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
    cpRows = db.prepare('SELECT idx FROM steps WHERE step_type = 23 ORDER BY idx DESC').all();
    const stepRow = db.prepare('SELECT metadata FROM steps ORDER BY idx DESC LIMIT 1').get();
    if (stepRow?.metadata) {
      const sm = parsePbMap(Buffer.from(stepRow.metadata));
      if (sm.has(1)) {
        const tsMap = parsePbMap(sm.get(1)[0]);
        if (tsMap.has(1)) {
          lastStepEpochMs = Number(tsMap.get(1)[0]) * 1000;
        }
      }
    }
  } finally {
    db.close();
  }
  if (!lastStepEpochMs) {
    try {
      lastStepEpochMs = statSync(dbPath).mtimeMs;
    } catch {}
  }

  const turns = [];
  let maxContextTokens = 256000;

  for (const row of rawRows) {
    const parsed = parseGenRow(row.idx, row.data);
    if (!parsed || parsed.contextTokens === 0) continue;
    if (parsed.maxContextTokens > 0) {
      maxContextTokens = parsed.maxContextTokens;
    }
    turns.push(parsed);
  }

  // Start accumulating from the latest compaction checkpoint so pre-compaction
  // output/thinking tokens do not inflate the active context breakdown.
  let epochStart = 0;
  if (turns.length > 0) {
    for (const cp of cpRows) {
      const postIdx = turns.findIndex((t) => t.lastStepIndex >= cp.idx);
      if (postIdx >= 0) {
        epochStart = postIdx;
        break;
      }
    }
    for (let i = epochStart + 1; i < turns.length; i++) {
      if (turns[i].contextTokens < turns[i - 1].contextTokens * 0.7) {
        epochStart = i;
      }
    }
  }

  const latest = turns[turns.length - 1] || {
    uncachedIn: 0,
    cachedIn: 0,
    contextTokens: 0,
    outTokens: 0,
    thinkTokens: 0,
  };
  if (turns.length === 0 || latest.contextTokens === 0) {
    lastStepEpochMs = 0;
  }

  // latest.contextTokens is the prompt sent *before* latest generated its output/thinking,
  // so only accumulate prior turns within the active compaction epoch.
  let rawOut = 0;
  let rawThink = 0;
  for (let i = epochStart; i < turns.length - 1; i++) {
    rawOut += turns[i].outTokens;
    rawThink += turns[i].thinkTokens;
  }

  const turn0Tokens = Math.min(turns[epochStart]?.contextTokens || 0, latest.contextTokens);
  const availGen = Math.max(0, latest.contextTokens - turn0Tokens);
  const genSum = rawOut + rawThink;
  const genScale = genSum > availGen && genSum > 0 ? availGen / genSum : 1;
  const totalOutputTokens = Math.round(rawOut * genScale);
  const totalThinkingTokens = Math.round(rawThink * genScale);
  const quotaGroups = await fetchQuotaGroups();

  return {
    uiVersion: 19,
    cachedIn: latest.cachedIn,
    uncachedIn: latest.uncachedIn,
    contextTokens: latest.contextTokens,
    maxContextTokens,
    lastStepEpochMs,
    turn0Tokens,
    totalOutputTokens,
    totalThinkingTokens,
    quotaGroups,
  };
}

const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>agy-capsule</title>
  <script src="/preload.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 14px;
      font-family: "Source Han Sans CN", "思源黑体 CN", "Source Han Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      font-weight: 400;
      font-variation-settings: normal;
      font-variant-ligatures: normal;
      background: var(--background, #141414);
      color: var(--foreground, #ebebeb);
      font-size: 13.5px;
      line-height: 1.32;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .panel {
      width: 100%;
      max-width: 196px;
      padding: 4px 2px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 6px;
    }
    .used-pct {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--foreground, #18181b);
      color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
    }
    .used-fraction {
      font-size: 13.5px;
      color: var(--muted-foreground, #8e8e93);
      font-variant-numeric: tabular-nums;
    }
    .progress-track {
      position: relative;
      width: 100%;
      height: 4px;
      background: rgba(142, 142, 147, 0.24);
      border-radius: 999px;
      display: flex;
      gap: 1.5px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .seg {
      height: 100%;
      border-radius: 999px;
      transition: width 0.25s ease;
    }
    .list {
      display: grid;
      grid-template-columns: 1fr auto minmax(44px, auto);
      row-gap: 7px;
      column-gap: 8px;
      align-items: center;
    }
    .item-row {
      display: contents;
    }
    .item-left {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted-foreground, #8e8e93);
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
    }
    .item-left > span:last-child {
      overflow: hidden;
      text-overflow: clip;
      white-space: nowrap;
    }
    .dot {
      width: 9.5px;
      height: 9.5px;
      border-radius: 2.5px;
      flex-shrink: 0;
      transition: background-color 0.25s ease, opacity 0.25s ease;
    }
    .dot-cached { background: #2b7fff; }
    .dot-uncached { background: #f97316; }
    .dot-meta { background: rgba(142, 142, 147, 0.55); }
    .item-pct {
      text-align: right;
      justify-self: end;
      color: var(--muted-foreground, #8e8e93);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-size: 13.5px;
      margin-right: 6px;
    }
    .item-k {
      text-align: right;
      justify-self: end;
      color: var(--muted-foreground, #8e8e93);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-size: 13.5px;
    }
    .divider {
      height: 1px;
      background: rgba(142, 142, 147, 0.18);
      margin: 11px 0;
    }
    .quota-group {
      margin-bottom: 9px;
    }
    .quota-group:last-child {
      margin-bottom: 0;
    }
    .quota-group-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--foreground, #18181b);
      color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
      margin-bottom: 4px;
    }
    .quota-bucket {
      margin-bottom: 4px;
    }
    .quota-bucket:last-child {
      margin-bottom: 0;
    }
    .quota-line1 {
      display: grid;
      grid-template-columns: 54px 50px 48px;
      align-items: center;
      column-gap: 8px;
      font-size: 13.5px;
      font-variant-numeric: tabular-nums;
    }
    .quota-label {
      color: var(--muted-foreground, #8e8e93);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      min-width: 0;
    }
    .quota-mid {
      text-align: left;
      color: var(--muted-foreground, #8e8e93);
      white-space: nowrap;
    }
    .quota-right {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 6px;
      color: var(--muted-foreground, #8e8e93);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="panel">
    <div class="summary-row">
      <div class="used-pct" id="used-pct">0% used</div>
      <div class="used-fraction" id="used-fraction">0 / 256k</div>
    </div>

    <div class="progress-track" id="progress-track">
      <div class="seg" id="seg-turn0" style="width: 0%; background: #d4940a"></div>
      <div class="seg" id="seg-read" style="width: 0%; background: #388bfd"></div>
      <div class="seg" id="seg-think" style="width: 0%; background: #00b386"></div>
      <div class="seg" id="seg-out" style="width: 0%; background: #e86a24"></div>
    </div>

    <div class="list">
      <div class="item-row" id="row-cached">
        <div class="item-left"><span class="dot" id="dot-cached" style="display:inline-flex;align-items:center;justify-content:center;background:transparent"></span><span>Cache</span></div>
        <div class="item-pct" id="val-cache-hit">0%</div>
        <div class="item-k" id="val-cache-hit-k"></div>
      </div>

      <div class="item-row" id="row-turn0">
        <div class="item-left"><span class="dot" style="background:#d4940a"></span><span>Turn0</span></div>
        <div class="item-pct" id="val-turn0-pct">0%</div>
        <div class="item-k" id="val-turn0-k">0.0k</div>
      </div>

      <div class="item-row" id="row-read">
        <div class="item-left"><span class="dot" style="background:#388bfd"></span><span>Read</span></div>
        <div class="item-pct" id="val-read-pct">0%</div>
        <div class="item-k" id="val-read-k">0.0k</div>
      </div>

      <div class="item-row" id="row-think">
        <div class="item-left"><span class="dot" style="background:#00b386"></span><span>Think</span></div>
        <div class="item-pct" id="val-think-pct">0%</div>
        <div class="item-k" id="val-think-k">0.0k</div>
      </div>

      <div class="item-row" id="row-out">
        <div class="item-left"><span class="dot" style="background:#e86a24"></span><span>Write</span></div>
        <div class="item-pct" id="val-out-pct">0%</div>
        <div class="item-k" id="val-out-k">0.0k</div>
      </div>
    </div>

    <div class="divider"></div>

    <div id="quota-root"></div>
  </div>

  <script>
    function fmtK(n) {
      const num = Number(n || 0);
      if (num < 1000) return String(num);
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
      return (num / 1000).toFixed(1).replace(/\\.0$/, '') + 'k';
    }

    function fmtColK(n) {
      const num = Number(n || 0);
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
      return (num / 1000).toFixed(1) + 'k';
    }

    const fmtExact = (n) => Number(n || 0).toLocaleString();

    function formatResetShort(isoStr) {
      if (!isoStr) return '';
      const diffMs = new Date(isoStr).getTime() - Date.now();
      if (diffMs <= 0) return 'soon';
      const totalMin = Math.floor(diffMs / 60000);
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      if (d > 0) return d + 'd ' + String(h).padStart(2, '0') + 'h';
      if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
      return String(Math.max(1, m)).padStart(2, '0') + 'm';
    }

    function makeRingSvg(frac) {
      const clamped = Math.max(0, Math.min(1, Number(frac || 0)));
      const r = 6.5;
      const c = 2 * Math.PI * r;
      const offset = c * (1 - clamped);
      const color = clamped <= 0.1 ? '#ef4444' : (clamped <= 0.25 ? '#f59e0b' : '#4ea84e');
      return (
        '<svg width="18" height="18" viewBox="0 0 18 18" style="transform: rotate(-90deg); flex-shrink: 0;">' +
        '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="rgba(142,142,147,0.28)" stroke-width="2.2"/>' +
        '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" ' +
        'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
        '</svg>'
      );
    }

    function formatGroupTitle(raw) {
      const s = String(raw || '').trim();
      if (s === 'Gemini Models') return 'Gemini';
      if (s.toLowerCase().startsWith('claude')) return 'Claude';
      return s;
    }

    function renderQuota(groups) {
      const root = document.getElementById('quota-root');
      if (!Array.isArray(groups) || groups.length === 0) return;
      let html = '';
      const windowOrder = { '5h': 0, weekly: 1 };
      for (const g of groups) {
        html += '<div class="quota-group">';
        html += '<div class="quota-group-title">' + formatGroupTitle(g.displayName) + '</div>';
        const buckets = [...(g.buckets || [])].sort(
          (a, b) => (windowOrder[a.window] ?? 2) - (windowOrder[b.window] ?? 2)
        );
        for (const b of buckets) {
          const baseLabel =
            b.window === 'weekly'
              ? 'Weekly'
              : b.window === '5h'
                ? '5 Hours'
                : String(b.displayName || b.window || '')
                    .replace(/\\s*limit\\b/gi, '')
                    .replace(/\\b5h(?:ours)?\\b/gi, '5 Hours')
                    .trim();
          const resetShort = formatResetShort(b.resetTime);
          const pctLeft = Math.round((b.remainingFraction || 0) * 100);
          html += '<div class="quota-bucket">';
          html += '  <div class="quota-line1">';
          html += '    <span class="quota-label">' + baseLabel + '</span>';
          html += '    <span class="quota-right"><span>' + pctLeft + '%</span>' + makeRingSvg(b.remainingFraction) + '</span>';
          html += '    <span class="quota-mid">' + resetShort + '</span>';
          html += '  </div>';
          html += '</div>';
        }
        html += '</div>';
      }
      root.innerHTML = html;
    }

    async function refresh() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token') || '';
        const convId = window.sidecar?.conversationId || urlParams.get('conversationId') || '';
        const qs = new URLSearchParams();
        if (convId) qs.set('conversationId', convId);
        if (token) qs.set('token', token);
        const qStr = qs.toString() ? '?' + qs.toString() : '';
        const headers = token ? { 'X-Sidecar-Token': token } : {};
        const res = await fetch('/api/context' + qStr, { method: 'GET', headers });
        const d = await res.json();
        if (d.error) return;
        if (d.uiVersion && d.uiVersion !== 19) {
          window.location.reload();
          return;
        }

        const maxCtx = d.maxContextTokens || 256000;
        const ctx = d.contextTokens || 0;
        const cached = d.cachedIn || 0;
        const out = d.totalOutputTokens || 0;
        const think = d.totalThinkingTokens || 0;
        const turn0 = d.turn0Tokens || 0;
        const read = Math.max(0, ctx - turn0 - out - think);

        const usedPct = maxCtx > 0 ? Math.round((ctx / maxCtx) * 100) : 0;
        const usedPctExact = maxCtx > 0 ? Math.min(100, (ctx / maxCtx) * 100) : 0;
        const compSum = read + out + think + turn0;
        const scale = compSum > 0 ? usedPctExact / compSum : 0;

        const readPct = maxCtx > 0 ? Math.round((read / maxCtx) * 100) : 0;
        const outPct = maxCtx > 0 ? Math.round((out / maxCtx) * 100) : 0;
        const thinkPct = maxCtx > 0 ? Math.round((think / maxCtx) * 100) : 0;
        const turn0Pct = maxCtx > 0 ? Math.round((turn0 / maxCtx) * 100) : 0;
        const cacheHitPct = ctx > 0 ? Math.round((cached / ctx) * 100) : 0;

        const usedPctEl = document.getElementById('used-pct');
        usedPctEl.textContent = usedPct + '% used';

        document.getElementById('used-fraction').textContent = fmtK(ctx) + ' / ' + fmtK(maxCtx);
        document.getElementById('used-fraction').title = fmtExact(ctx) + ' / ' + fmtExact(maxCtx) + ' tokens';

        const dotCachedEl = document.getElementById('dot-cached');
        document.getElementById('seg-read').style.width = (read * scale).toFixed(2) + '%';
        document.getElementById('seg-out').style.width = (out * scale).toFixed(2) + '%';
        document.getElementById('seg-think').style.width = (think * scale).toFixed(2) + '%';
        document.getElementById('seg-turn0').style.width = (turn0 * scale).toFixed(2) + '%';

        // 3-minute cache cooling warning & 4-minute cold state
        const idleSec = (ctx > 0 && d.lastStepEpochMs) ? Math.max(0, Math.floor((Date.now() - d.lastStepEpochMs) / 1000)) : 0;
        const valCacheHitEl = document.getElementById('val-cache-hit');
        const valCacheHitKEl = document.getElementById('val-cache-hit-k');
        let valCacheHitText = cacheHitPct + '%';
        let valCacheHitK = '';
        if (idleSec >= 240) {
          dotCachedEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#e06c75" stroke-width="2" stroke-linecap="round"><line x1="2.2" y1="2.2" x2="9.8" y2="9.8"/><line x1="9.8" y1="2.2" x2="2.2" y2="9.8"/></svg>';
          valCacheHitEl.style.color = 'var(--muted-foreground, #8e8e93)';
          valCacheHitEl.style.textDecoration = 'line-through';
          valCacheHitEl.style.opacity = '0.5';
          if (valCacheHitKEl) {
            valCacheHitKEl.style.color = 'var(--muted-foreground, #8e8e93)';
          }
        } else if (idleSec >= 180) {
          const remMin = Math.max(1, Math.ceil((240 - idleSec) / 60));
          dotCachedEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#d4940a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4.8"/><polyline points="6 3.5 6 6 7.8 7.2"/></svg>';
          valCacheHitEl.style.color = '#d4940a';
          valCacheHitEl.style.textDecoration = 'none';
          valCacheHitEl.style.opacity = '1';
          valCacheHitK = '~' + remMin + 'm';
          if (valCacheHitKEl) {
            valCacheHitKEl.style.color = '#d4940a';
          }
        } else {
          dotCachedEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(142,142,147,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6.5 4.8 9.2 10 3"/></svg>';
          valCacheHitEl.style.color = 'var(--muted-foreground, #8e8e93)';
          valCacheHitEl.style.textDecoration = 'none';
          valCacheHitEl.style.opacity = '1';
          if (valCacheHitKEl) {
            valCacheHitKEl.style.color = 'var(--muted-foreground, #8e8e93)';
          }
        }

        const idleMin = Math.floor(idleSec / 60);
        const idleRemSec = idleSec % 60;
        const idleStr = idleMin > 0 ? (idleMin + 'm ' + idleRemSec + 's ago') : (idleRemSec + 's ago');

        valCacheHitEl.textContent = valCacheHitText;
        if (valCacheHitKEl) valCacheHitKEl.textContent = valCacheHitK;
        document.getElementById('row-cached').title = ctx === 0
          ? '0 / 0 cached · New conversation'
          : (fmtExact(cached) + ' / ' + fmtExact(ctx) + ' cached · Last turn ' + idleStr);

        document.getElementById('val-turn0-pct').textContent = turn0Pct + '%';
        document.getElementById('val-turn0-k').textContent = fmtColK(turn0);
        document.getElementById('val-read-pct').textContent = readPct + '%';
        document.getElementById('val-read-k').textContent = fmtColK(read);
        document.getElementById('val-think-pct').textContent = thinkPct + '%';
        document.getElementById('val-think-k').textContent = fmtColK(think);
        document.getElementById('val-out-pct').textContent = outPct + '%';
        document.getElementById('val-out-k').textContent = fmtColK(out);

        if (d.quotaGroups) {
          renderQuota(d.quotaGroups);
        }
      } catch (e) {
        console.error(e);
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;

export { inspectConversation };

if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  const app = new SidecarApp();
  app.page('/', () => UI_HTML);
  app.page('/ui.html', () => UI_HTML);
  app.api('/api/context', (data) => inspectConversation(data?.conversationId || app.config.conversationId), 'GET');
  app.run();
}
if (process.env.ANTIGRAVITY_LS_ADDRESS || process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  startDeckInjector(inspectConversation);
}
