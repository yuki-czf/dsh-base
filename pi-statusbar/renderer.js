/*
 * PI Statusbar — renderer extension (runs in the app's own document).
 *
 * A standalone usage strip pinned just BELOW the composer element (outside of
 * it), styled after ByteRax/zcode-token-usage-statusbar: thin, full composer
 * width, segments split by vertical dividers, spread across the width. It is
 * a body-level fixed element that tracks the composer rect every frame — it
 * never enters React's layout flow, and its stylesheet lives inside the bar
 * element so React purging <head> styles cannot strip it.
 *
 * Data, two sources merged:
 *   1. THIS window's rendered transcript (React tree walk — the same records
 *      the host holds for each assistant message): carries `responseDurationMs`
 *      and `usage.firstTokenMs` (local runtime patch), so the decode-window
 *      speed is computable per call:
 *        generated = outputTokens (+ reasoningTokens when reported separately)
 *        decodeMs  = durationMs − firstTokenMs        (windows ≥250 ms only)
 *        TPS       = Σ generated ÷ (Σ decodeMs / 1000)   (pooled)
 *      Without a first-token timestamp a call is skipped — never invented.
 *   2. The host's read-only `pi.usage.listTurns` (plugin host call) for
 *      TODAY's generated tokens across all sessions (token totals only — that
 *      contract has no first-token timing, so no speed is derived from it).
 *
 * While a round is STREAMING, the ⚡ headline switches to the live rate: exact
 * token deltas when the provider streams usage progressively, otherwise a ≈
 * estimate from the streaming message's DOM text growth (chars ÷ 2.8). Once
 * the round settles, ⚡ returns to the pooled value — every model call of the
 * NEWEST QUESTION, the same scope the speed capsule and the usage popover
 * aggregate; a single call's own rate stays in the tooltip.
 */

import React from "react";

const BAR_ID = "pi-statusbar-bar";
const TICK_MS = 1500;
const SCAN_MS = 3000;
const SPACER_PX = 30; // reserve a dedicated row (bar 26px + 4px gap)
const MIN_WINDOW_MS = 250;
const BURST_GAP_MS = 180000;
const LIVE_HOLD_MS = 15000; // keep fast rescanning this long after streaming activity
const LIVE_STALL_MS = 4000; // no fresh sample for this long while in-flight → show "…"
const LIVE_WINDOW_MS = 8000; // sliding window for the live rate
const CHARS_PER_TOKEN = 2.8; // DOM-growth estimate divisor (mixed CJK/code text)
const LIVE_EMA = 0.45; // smoothing weight of each instant sample
const TURN_WAIT_MS = 180000; // a just-sent question shows "…" for at most this long
const LS_KEY = "pi-statusbar.hiddenFields.v1"; // persists the gear's field visibility
const FIELDS = [
  ["speed", "⚡ 生成速度"],
  ["ttft", "◷ 首字"],
  ["e2e", "⋮ E2E"],
  ["think", "◈ 思考"],
  ["turn", "▤ 本轮"],
  ["session", "◧ 会话"],
  ["today", "⊛ 今日"],
];
const MAX_FIBERS = 20000;
const MAX_RECORDS = 800;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;
const RECORD_KEYS = [
  "message", "messages", "items", "rows", "entries", "list", "data",
  "value", "state", "session", "meta", "usage", "children", "props",
  "turn", "turns", "blocks", "parts", "node",
];

let host = null;
let bar = null;
let anchor = null;
let alive = false;
let posTimer = null;
let pollTimer = null;
let generation = 0;
let tickCount = 0;
let remoteTotals = null; // { today:{gen,calls}, latestFallback:{...} | null }
let lastGeom = null;
let lastSpacerEl = null;
let lastSnapshot = null;
let liveActiveUntil = 0; // while set, every poll rescans — streaming needs fresh records
let panel = null; // settings popover
let panelCloser = null;
let gearEl = null; // current gear segment (re-created on every render)
let hiddenFields = loadHidden(); // field keys the user switched off

const hub = {
  records: new Map(),
  node: null,
  transcriptNode: null, // DOM node whose text covers the transcript — live-meter sample base
  lastScan: 0,
  roots: null,
  rootsAt: 0,
  stats: { found: 0, visited: 0 },
};

const BAR_CSS = `
#${BAR_ID}{position:fixed;z-index:50;display:none;align-items:stretch;height:26px;
  padding:0 8px;border-radius:0 0 8px 8px;font-size:12px;line-height:26px;white-space:nowrap;
  color:var(--ds-text-tertiary,rgba(255,255,255,.55));
  background:var(--ds-bg-secondary,rgba(24,24,28,.92));
  border:1px solid var(--ds-border-subtle,rgba(127,127,127,.16));border-top:none;
  box-shadow:0 2px 8px rgba(0,0,0,.14);user-select:none;overflow:hidden}
#${BAR_ID} .seg{display:inline-flex;align-items:center;gap:6px;padding:0 12px;flex:1 1 auto;justify-content:center;min-width:0;overflow:hidden}
#${BAR_ID} .seg+.seg{border-left:1px solid var(--ds-border-subtle,rgba(127,127,127,.16))}
#${BAR_ID} b{font-weight:600;color:var(--ds-text-secondary,rgba(255,255,255,.88))}
#${BAR_ID} .speed b{color:var(--ds-success,#3fb950)}
#${BAR_ID} .live b{color:var(--ds-accent,#4c9aff)}
#${BAR_ID} .warn{color:var(--ds-warning,#d29922)}
#${BAR_ID} .pi-statusbar-anchor{display:block;width:1px;height:1px;min-width:1px;min-height:1px;flex:none;opacity:0;pointer-events:none;overflow:hidden}
#${BAR_ID} .gearbtn{cursor:pointer;flex:0 0 auto;padding:0 10px}
#${BAR_ID} .gearbtn:hover{background:var(--ds-bg-hover,rgba(127,127,127,.16))}
#${BAR_ID} .seg b{transition:color var(--motion-duration-fast,150ms) ease;font-variant-numeric:tabular-nums}
#${BAR_ID} .ic{display:inline-flex;align-items:center}
#${BAR_ID} .live .ic{animation:piPulse 1.6s ease-in-out infinite}
@keyframes piPulse{0%,100%{opacity:1}50%{opacity:.45}}
#${BAR_ID} .dots{display:inline-flex;align-items:center;gap:3px}
#${BAR_ID} .dots i{width:4px;height:4px;border-radius:999px;background:currentColor;animation:piDot 1.2s ease-in-out infinite}
#${BAR_ID} .dots i:nth-child(2){animation-delay:.18s}
#${BAR_ID} .dots i:nth-child(3){animation-delay:.36s}
@keyframes piDot{0%,80%,100%{opacity:.25}40%{opacity:1}}
@media (prefers-reduced-motion:reduce){
#${BAR_ID} .live .ic{animation:none}
#${BAR_ID} .dots i{animation:none}
#${BAR_ID} .seg b{transition:none}
}
`;
const PANEL_CSS = `
#${BAR_ID}-panel{position:fixed;z-index:60;background:var(--ds-bg-secondary,rgba(24,24,28,.97));
  border:1px solid var(--ds-border-subtle,rgba(127,127,127,.2));border-radius:8px;
  box-shadow:0 8px 24px rgba(0,0,0,.35);padding:8px 10px;font-size:12px;line-height:1;
  color:var(--ds-text-secondary,rgba(255,255,255,.85));min-width:176px;max-height:50vh;overflow:auto}
#${BAR_ID}-panel .t{font-size:11px;color:var(--ds-text-tertiary,rgba(255,255,255,.5));margin:0 2px 6px}
#${BAR_ID}-panel label{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;user-select:none}
#${BAR_ID}-panel label:hover{background:var(--ds-bg-hover,rgba(127,127,127,.12))}
#${BAR_ID}-panel input{accent-color:var(--ds-accent,#4c9aff);margin:0}
`;

async function call(method, args) {
  return host.dispatch("plugin.call", { method, args: args ?? {} });
}

// ---------------------------------------------------------------------------
// Composer tracking
// ---------------------------------------------------------------------------

/* Locate the composer: the chat input is the BOTTOM-MOST wide editable on the
 * page. The composer card is the first ancestor extending below the input
 * (toolbar row + padding). Returns the input's horizontal bounds plus the
 * card element (used both as geometry base and as the spacer margin target). */
function findComposer() {
  const editables = document.querySelectorAll("textarea, [contenteditable='true'], [contenteditable='']");
  let input = null;
  let inputRect = null;
  for (const el of editables) {
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect || rect.width < 200 || rect.height < 24) continue;
    if (!inputRect || rect.bottom > inputRect.bottom) {
      input = el;
      inputRect = rect;
    }
  }
  if (!input || !inputRect) {
    lastGeom = { stage: "no-input" };
    return null;
  }
  let node = input.parentElement;
  let guard = 0;
  while (node && node !== document.body && guard < 10) {
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0) {
      node = node.parentElement;
      guard += 1;
      continue;
    }
    if (rect.bottom > inputRect.bottom) {
      // first ancestor extending below the input = the composer card
      const found = {
        left: inputRect.left,
        width: inputRect.width,
        inputBottom: inputRect.bottom,
        inputTop: inputRect.top,
        cardEl: node,
        cardRect: serializeRect(rect),
      };
      lastGeom = { stage: "ok", input: serializeRect(inputRect), card: found.cardRect };
      return found;
    }
    node = node.parentElement;
    guard += 1;
  }
  // No ancestor extends below the input — the card IS the input row.
  lastGeom = { stage: "ok-flat", input: serializeRect(inputRect) };
  return {
    left: inputRect.left,
    width: inputRect.width,
    inputBottom: inputRect.bottom,
    inputTop: inputRect.top,
    cardEl: null,
    cardRect: null,
  };
}

function serializeRect(rect) {
  return rect
    ? { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) }
    : null;
}

const COMPOSER_GRACE_MS = 600; // keep the last position this long when the composer vanishes
let composerGoneSince = 0;
let spacerObserver = null;

/* The composer card is React-managed: a re-render (e.g. pasting an image)
 * can wipe our inline margin or replace the card node outright, which makes
 * the layout jump for one tick — the strip visibly flickers. An attribute
 * observer re-applies the margin in the same commit, before anything paints. */
function watchSpacer(cardEl) {
  if (spacerObserver && lastSpacerEl === cardEl) return;
  if (spacerObserver) {
    spacerObserver.disconnect();
    spacerObserver = null;
  }
  lastSpacerEl = cardEl;
  if (!cardEl || typeof MutationObserver === "undefined") return;
  if (cardEl.style.marginBottom !== `${SPACER_PX}px`) cardEl.style.marginBottom = `${SPACER_PX}px`;
  spacerObserver = new MutationObserver(() => {
    const el = lastSpacerEl;
    if (el && el.isConnected && el.style.marginBottom !== `${SPACER_PX}px`) {
      el.style.marginBottom = `${SPACER_PX}px`;
    }
  });
  spacerObserver.observe(cardEl, { attributes: true, attributeFilter: ["style", "class"] });
}

/* Position tick: rAF proved unreliable in this context (never fired), so the
 * strip is tracked with a plain 150 ms interval — cheap (one rect read) and
 * immune to paint throttling. */
function frame() {
  if (!alive) return;
  try {
    if (!bar || !bar.isConnected) return;
    const found = findComposer();
    if (!found) {
      // Transient DOM churn (pasting an image rebuilds composer parts) can
      // hide the input for a tick — keep the last position briefly instead
      // of blinking the strip out.
      if (!composerGoneSince) composerGoneSince = Date.now();
      if (Date.now() - composerGoneSince > COMPOSER_GRACE_MS) bar.style.display = "none";
      return;
    }
    composerGoneSince = 0;
    // Spacer: reserve a dedicated row for the strip by pushing the composer
    // card (and everything above it in the dock) up. watchSpacer keeps it
    // applied across React re-renders; onUnload restores the margin.
    watchSpacer(found.cardEl);
    const baseBottom =
      found.cardEl && found.cardEl.isConnected
        ? found.cardEl.getBoundingClientRect().bottom
        : found.inputBottom;
    bar.style.display = "flex";
    bar.style.left = `${Math.round(found.left)}px`;
    bar.style.width = `${Math.round(found.width)}px`;
    bar.style.top = `${Math.round(Math.min(baseBottom + 4, window.innerHeight - 30))}px`;
    if (panel) positionPanel();
  } catch {
    // never let one bad tick kill the loop
  }
}

// ---------------------------------------------------------------------------
// Record collection from the rendered transcript (React tree walk).
// ---------------------------------------------------------------------------

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timeOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e11 ? value : value * 1000;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/** Normalize one rendered message object into a timing record. */
function recordFrom(value) {
  if (!value || typeof value !== "object") return null;
  const role = typeof value.role === "string" ? value.role : null;
  if (role === "user") {
    const userId = String(value.id ?? value.messageId ?? "");
    if (!UUID.test(userId)) return null;
    return { id: userId, role: "user", atMs: timeOf(value.createdAt), durationMs: null, ttftMs: null, gen: 0 };
  }
  if (role !== "assistant") return null;
  const usage =
    (value.usage && typeof value.usage === "object" && value.usage) ||
    (value.meta && typeof value.meta === "object" && value.meta.usage && typeof value.meta.usage === "object" && value.meta.usage) ||
    null;
  const durationMs = num(value.responseDurationMs) ?? num(value.meta?.responseDurationMs);
  const ttftMs = num(usage?.firstTokenMs) ?? num(value.responseFirstTokenMs) ?? num(value.meta?.responseFirstTokenMs);
  const out = num(usage?.outputTokens) ?? num(value.responseOutputTokens);
  const rea = num(usage?.reasoningTokens);
  if (durationMs === null && out === null && ttftMs === null) return null;
  const id = String(value.id ?? value.messageId ?? `${role}:${value.createdAt ?? ""}:${out ?? ""}`);
  const atMs = timeOf(value.createdAt) ?? timeOf(value.meta?.createdAt) ?? Date.now();
  return {
    id,
    role,
    atMs,
    durationMs,
    ttftMs,
    out,
    rea,
    gen: (out ?? 0) + (rea !== null && rea > (out ?? 0) ? rea : 0),
  };
}

const hasOrder = (record) => !!record && record.listId !== null && record.listId !== undefined && Number.isFinite(record.seq);

function collect(value, depth, out, seen, order) {
  const maxDepth = order && order.entry ? 9 : 4;
  if (depth > maxDepth || !value || typeof value !== "object" || out.length > 900) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    const head = value.slice(0, 20);
    const looksLikeMessages = head.some((row) => row && typeof row === "object" && typeof row.role === "string");
    const looksLikeEntries = !looksLikeMessages && head.some((row) => row && typeof row === "object" && Array.isArray(row.parts));
    let listId = order ? order.listId : null;
    if (looksLikeMessages || looksLikeEntries) {
      const first = head.find((row) => row && typeof row === "object" && row.id) ?? head[0];
      const last = value[value.length - 1];
      listId = `L:${String(first?.id ?? "?").slice(0, 8)}:${value.length}:${String(last?.id ?? "?").slice(0, 8)}`;
    }
    const limit = Math.min(value.length, 120);
    for (let index = 0; index < limit; index += 1) {
      const item = value[index];
      if (!item || typeof item !== "object") continue;
      const next = {
        listId: listId ?? null,
        seq: looksLikeMessages || looksLikeEntries ? index : order ? order.seq : null,
        entry: looksLikeEntries ? String(item.id ?? `${listId ?? "L"}#${index}`) : order ? order.entry : null,
      };
      const record = recordFrom(item);
      if (record) {
        out.push({ ...record, ...next });
        continue;
      }
      if (looksLikeEntries) {
        collect(item, depth + 1, out, new Set(seen), next);
        continue;
      }
      collect(item, depth + 1, out, seen, next);
    }
    return;
  }
  const record = recordFrom(value);
  if (record) {
    out.push({
      ...record,
      listId: order ? order.listId : null,
      seq: order ? order.seq : null,
      entry: order ? order.entry : null,
    });
    return;
  }
  for (const key of RECORD_KEYS) {
    if (value[key] !== undefined) collect(value[key], depth + 1, out, seen, order);
  }
}

function fiberOf(element) {
  if (!element) return null;
  for (const key of Object.keys(element)) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) return element[key];
  }
  return null;
}

function rootOf(fiber) {
  let node = fiber;
  let levels = 0;
  while (node && node.return && levels < 600) {
    node = node.return;
    levels += 1;
  }
  return node;
}

/* First real DOM element rendered by this fiber's subtree (the stateNode of
 * the nearest host descendant) — lets the live meter watch the streaming
 * message's text growth without guessing at page structure. */
function firstDomOf(fiber) {
  const stack = [fiber];
  let guard = 0;
  while (stack.length && guard < 200) {
    const node = stack.pop();
    guard += 1;
    if (node && node.stateNode && node.stateNode.nodeType === 1) return node.stateNode;
    let child = node ? node.child : null;
    while (child) {
      stack.push(child);
      child = child.sibling;
    }
  }
  return null;
}

/** Enumerate every createRoot container on the page. */
function containerRoots(ownRoot) {
  const roots = new Set();
  if (ownRoot) roots.add(ownRoot);
  try {
    for (const element of document.querySelectorAll("*")) {
      for (const key of Object.keys(element)) {
        if (!key.startsWith("__reactContainer$")) continue;
        const fiber = element[key] && element[key].current;
        if (fiber) roots.add(fiber);
      }
    }
  } catch {
    // discovery is best-effort
  }
  return [...roots];
}

function scanRecords() {
  const fiber = fiberOf(hub.node);
  if (!fiber) return false;
  const ownRoot = rootOf(fiber);
  if (!hub.roots || Date.now() - hub.rootsAt > 60000) {
    hub.roots = containerRoots(ownRoot);
    hub.rootsAt = Date.now();
  }
  const out = [];
  const seen = new Set();
  let bestLen = 0;
  let bestNode = null; // most text-bearing DOM node among record-rendering fibers = transcript
  let visited = 0;
  for (const root of hub.roots) {
    if (visited >= MAX_FIBERS) break;
    const queue = [root];
    while (queue.length && visited < MAX_FIBERS) {
      const current = queue.shift();
      visited += 1;
      try {
        const outBefore = out.length;
        if (current.memoizedProps) collect(current.memoizedProps, 0, out, seen);
        let hook = current.memoizedState;
        let index = 0;
        while (hook && index < 60) {
          collect(hook.memoizedState, 0, out, seen);
          hook = hook.next;
          index += 1;
        }
        const got = out.length - outBefore;
        if (got >= 2) {
          const el = firstDomOf(current);
          if (el) {
            let len = 0;
            try {
              len = el.textContent.length;
            } catch {
              len = 0;
            }
            if (len > bestLen) {
              bestLen = len;
              bestNode = el;
            }
          }
        }
      } catch {
        // one bad fiber must not stop the walk
      }
      let child = current.child;
      while (child && visited < MAX_FIBERS) {
        queue.push(child);
        child = child.sibling;
      }
    }
  }
  hub.stats.visited = visited;
  hub.stats.found = out.length;
  // The composer's own root also carries the session in its state but renders
  // only ~55 chars of chrome — accept a node as "the transcript" only when its
  // text is substantial; otherwise keep the previous one while it lives.
  hub.transcriptNode =
    bestLen >= 400
      ? bestNode
      : hub.transcriptNode && hub.transcriptNode.isConnected
        ? hub.transcriptNode
        : bestNode;

  let collisions = 0;
  for (const record of out) {
    // One call can be reachable twice (transcript row + streaming copy): user
    // rows dedupe by id, finished assistant rows by content signature. A
    // STREAMING assistant row gets ONE slot keyed by creation time, so its
    // partial snapshots replace each other instead of stacking up as separate
    // calls in the turn sums.
    const key =
      record.role === "user"
        ? `user|${record.id}`
        : record.durationMs === null
          ? `live|${record.atMs}`
          : `${record.role}|${record.atMs}|${record.durationMs}|${record.ttftMs}|${record.gen}`;
    record.key = key;
    const previous = hub.records.get(key);
    if (!previous) {
      hub.records.set(key, record);
      continue;
    }
    collisions += 1;
    const better =
      (!previous.entry && record.entry) ||
      (!hasOrder(previous) && hasOrder(record)) ||
      (previous.durationMs === null && record.durationMs !== null) ||
      (previous.ttftMs === null && record.ttftMs !== null) ||
      record.gen > previous.gen;
    if (better) {
      hub.records.set(key, {
        ...previous,
        ...record,
        listId: record.listId ?? previous.listId ?? null,
        seq: record.seq ?? previous.seq ?? null,
        entry: record.entry ?? previous.entry ?? null,
      });
    }
  }
  // A live slot is superseded once the completed copy of the same call landed
  // (same creation tick), or when it is clearly ancient.
  const completedAt = new Set();
  for (const record of hub.records.values()) {
    if (record.role !== "user" && record.durationMs !== null) completedAt.add(record.atMs);
  }
  const nowMs = Date.now();
  for (const [key, record] of hub.records) {
    if (!key.startsWith("live|")) continue;
    if (completedAt.has(record.atMs) || nowMs - record.atMs > 1800000) hub.records.delete(key);
  }
  if (hub.records.size > MAX_RECORDS) {
    const users = [...hub.records.values()].filter((record) => record.role === "user");
    const calls = [...hub.records.values()]
      .filter((record) => record.role !== "user")
      .sort((a, b) => b.atMs - a.atMs)
      .slice(0, Math.max(0, MAX_RECORDS - users.length));
    hub.records = new Map([...users, ...calls].map((record) => [record.key ?? record.id, record]));
  }
  return out.length > 0;
}

function refreshRecords(force) {
  const now = Date.now();
  if (!force && now - hub.lastScan < SCAN_MS) return;
  hub.lastScan = now;
  try {
    scanRecords();
  } catch {
    // scanning is best-effort by design
  }
}

// ---------------------------------------------------------------------------
// Speeds from the collected records (decode-window 口径).
// ---------------------------------------------------------------------------

function decodeOf(record) {
  if (record.durationMs === null || record.durationMs <= 0) return null;
  if (record.ttftMs === null || record.ttftMs < 0 || record.ttftMs >= record.durationMs) return null;
  const window = record.durationMs - record.ttftMs;
  return window >= MIN_WINDOW_MS ? window : null;
}

function pooled(genSum, decodeMsSum) {
  if (decodeMsSum <= 0 || !(genSum > 0)) return null;
  return Math.round(genSum / (decodeMsSum / 1000));
}

/** Every model call after the newest real user message of the same list. */
function turnScope() {
  const all = [...hub.records.values()].filter((record) => record.gen > 0).sort((a, b) => a.atMs - b.atMs);
  if (!all.length) return null;

  // 1) flat message list: everything after the last user marker of that list.
  const buckets = new Map();
  for (const record of hub.records.values()) {
    if (!record.listId || !hasOrder(record) || record.entry) continue;
    const bucket = buckets.get(record.listId) ?? { users: [], assistants: [] };
    (record.role === "user" ? bucket.users : bucket.assistants).push(record);
    buckets.set(record.listId, bucket);
  }
  let best = null;
  for (const bucket of buckets.values()) {
    if (!bucket.users.length || !bucket.assistants.length) continue;
    const boundarySeq = Math.max(...bucket.users.map((record) => record.seq));
    const scoped = bucket.assistants.filter((record) => record.seq > boundarySeq);
    if (!scoped.length) continue;
    const reach = Math.max(...scoped.map((record) => record.atMs));
    if (!best || reach > best.reach) best = { scoped, reach };
  }

  // 2) entry groups (one question → all its model calls).
  if (!best) {
    const groups = new Map();
    for (const record of all) {
      if (!record.entry) continue;
      const bucket = groups.get(record.entry) ?? [];
      bucket.push(record);
      groups.set(record.entry, bucket);
    }
    let bestEntry = null;
    for (const bucket of groups.values()) {
      if (bucket.length < 2) continue;
      const reach = Math.max(...bucket.map((record) => record.atMs));
      if (!bestEntry || reach > bestEntry.reach) bestEntry = { bucket, reach };
    }
    if (bestEntry) best = { scoped: bestEntry.bucket, reach: bestEntry.reach };
  }

  // 3) newest user timestamp as boundary.
  if (!best) {
    const userTimes = [...hub.records.values()]
      .filter((record) => record.role === "user" && typeof record.atMs === "number")
      .map((record) => record.atMs);
    if (userTimes.length) {
      const boundaryAt = Math.max(...userTimes);
      const scoped = all.filter((record) => record.atMs >= boundaryAt);
      if (scoped.length) best = { scoped, reach: boundaryAt };
    }
  }

  // 4) contiguous stretch fallback.
  if (!best) {
    const newest = all[all.length - 1];
    let startMs = newest.atMs;
    for (let index = all.length - 2; index >= 0; index -= 1) {
      if (startMs - all[index].atMs > BURST_GAP_MS) break;
      startMs = all[index].atMs;
    }
    best = { scoped: all.filter((record) => record.atMs >= startMs), reach: newest.atMs };
  }
  return best;
}

function turnStats() {
  const scope = turnScope();
  if (!scope) return null;
  const scoped = [...scope.scoped].sort((a, b) => a.atMs - b.atMs);
  let gen = 0;
  let decodeGen = 0;
  let decodeMs = 0;
  let decodeRea = 0; // 进了解码窗的推理单报 token（思考估算用）
  let calls = 0;
  for (const record of scoped) {
    gen += record.gen;
    calls += 1;
    const window = decodeOf(record);
    if (window !== null) {
      decodeGen += record.gen;
      decodeMs += window;
      if (record.rea !== null && record.rea > 0) decodeRea += record.rea;
    }
  }
  return { gen, calls, decodeTps: pooled(decodeGen, decodeMs), thinkRea: decodeRea };
}

function latestStats() {
  const all = [...hub.records.values()]
    .filter((record) => record.role !== "user" && record.gen > 0)
    .sort((a, b) => b.atMs - a.atMs);
  return all[0] ?? null;
}

function sessionStats() {
  const calls = [...hub.records.values()].filter((record) => record.role !== "user");
  let gen = 0;
  let decodeGen = 0;
  let decodeMs = 0;
  for (const record of calls) {
    gen += record.gen;
    const window = decodeOf(record);
    if (window !== null) {
      decodeGen += record.gen;
      decodeMs += window;
    }
  }
  return { gen, calls: calls.length, decodeTps: pooled(decodeGen, decodeMs) };
}
// ---------------------------------------------------------------------------
// Live rate while a round is streaming.
// ---------------------------------------------------------------------------

/* One shared sample buffer; reset whenever no call is in flight. */
const live = {
  samples: [], // {t, gen} — exact usage deltas of the in-flight call
  dom: [], // {t, len} — textContent growth of the streaming message's DOM
  ema: null,
  rate: null,
  mode: "idle", // idle | gen-exact | gen-est | gen-wait
  source: null, // usage | dom
  at: 0,
  flightGen: null,
  domLen: null, // last sampled transcript text length (diagnostics)
};

function resetLive() {
  live.samples.length = 0;
  live.dom.length = 0;
  live.ema = null;
  live.rate = null;
  live.mode = "idle";
  live.source = null;
  live.at = 0;
  live.flightGen = null;
}

/** The newest assistant record that has started but not finished. */
function newestInFlight() {
  let flight = null;
  for (const record of hub.records.values()) {
    if (record.role === "user" || record.durationMs !== null) continue;
    if (record.ttftMs === null && !(record.gen > 0)) continue;
    if (!flight || record.atMs > flight.atMs) flight = record;
  }
  return flight;
}

/* 思考秒表状态：盯最后一个 thinking 块的长度变化。len=-1 = 未播种。 */
const thinkWatch = { el: null, len: -1, at: 0, startAt: 0, elapsedMs: 0, active: false };
function liveState() {
  const now = Date.now();
  // Sample the transcript's text growth EVERY poll, flight or not — on
  // channels whose in-flight calls never surface as records (usage lands only
  // with the finished call) this is the only live signal there is.
  let est = null;
  const node = hub.transcriptNode;
  if (node && node.isConnected) {
    try {
      const len = node.textContent.length;
      live.dom.push({ t: now, len });
      live.domLen = len;
      while (live.dom.length > 12) live.dom.shift();
      for (const sample of live.dom) {
        const dt = now - sample.t;
        const grown = len - sample.len;
        if (dt >= 1200 && dt <= LIVE_WINDOW_MS && grown > 40) {
          est = grown / CHARS_PER_TOKEN / (dt / 1000);
          break;
        }
      }
    } catch {
      hub.transcriptNode = null; // node left the DOM — the next scan re-finds one
    }
  }
  // 思考秒表：最后一个 thinking 块在长 = 思考进行中。起点=从静止恢复增长的时刻；
  // 停增 8s 视为思考结束（短暂 markdown 抖动不断表）。len=-1 = 未播种，首采样只记录。
  try {
    const thinkNodes = document.querySelectorAll('[class*="think" i]');
    const lastThink = thinkNodes.length ? thinkNodes[thinkNodes.length - 1] : null;
    if (lastThink && lastThink.isConnected) {
      const tLen = lastThink.textContent.length;
      if (thinkWatch.len < 0) {
        thinkWatch.len = tLen;
      } else {
        const grew = tLen - thinkWatch.len;
        if (grew > 8) {
          if (!thinkWatch.active) {
            thinkWatch.active = true;
            thinkWatch.startAt = now;
          }
          thinkWatch.at = now;
        } else if (thinkWatch.active && now - thinkWatch.at > 8000) {
          thinkWatch.active = false;
        }
      }
      thinkWatch.len = tLen;
    } else {
      thinkWatch.active = false;
    }
  } catch {
    thinkWatch.active = false;
  }
  if (thinkWatch.active) thinkWatch.elapsedMs = now - thinkWatch.startAt;
  live.flightGen = flight ? flight.gen : null;
  if (!flight) {
    if (est !== null) {
      // Tokens are flowing without a visible in-flight record — the common
      // case here. The usage-based exact mode engages automatically on
      // channels that do stream usage.
      live.samples.length = 0;
      liveActiveUntil = now + LIVE_HOLD_MS;
      live.ema = live.ema === null ? est : live.ema * (1 - LIVE_EMA) + est * LIVE_EMA;
      live.at = now;
      live.source = "dom";
      live.mode = "gen-est";
      live.rate = Math.max(1, Math.round(live.ema));
      return live;
    }
    // No flight and no growth — but a just-sent question means the round has
    // started even before its first tokens land; show a wait mark a while.
    let lastUserAt = null;
    let lastDoneAt = null;
    for (const record of hub.records.values()) {
      if (record.role === "user") {
        if (typeof record.atMs === "number" && (lastUserAt === null || record.atMs > lastUserAt)) lastUserAt = record.atMs;
      } else if (record.durationMs !== null && typeof record.atMs === "number") {
        if (lastDoneAt === null || record.atMs > lastDoneAt) lastDoneAt = record.atMs;
      }
    }
    live.samples.length = 0;
    const waiting =
      lastUserAt !== null &&
      (lastDoneAt === null || lastUserAt > lastDoneAt) &&
      now - lastUserAt < TURN_WAIT_MS;
    live.mode = waiting ? "gen-wait" : "idle";
    if (!waiting) resetLive();
    return live;
  }
  liveActiveUntil = now + LIVE_HOLD_MS;
  live.samples.push({ t: now, gen: flight.gen });
  while (live.samples.length > 12) live.samples.shift();
  let exact = null;
  for (const sample of live.samples) {
    const dt = now - sample.t;
    const grown = flight.gen - sample.gen;
    if (dt >= 1200 && dt <= LIVE_WINDOW_MS && grown > 0) {
      exact = (grown * 1000) / dt;
      break; // samples are chronological — oldest in-window first
    }
  }
  const instant = exact ?? est;
  if (instant !== null && instant > 0) {
    live.ema = live.ema === null ? instant : live.ema * (1 - LIVE_EMA) + instant * LIVE_EMA;
    live.at = now;
    live.source = exact !== null ? "usage" : "dom";
  }
  if (live.ema !== null && now - live.at <= LIVE_STALL_MS * 2) {
    live.mode = live.source === "usage" ? "gen-exact" : "gen-est";
    live.rate = Math.max(1, Math.round(live.ema));
  } else {
    live.mode = "gen-wait";
    live.rate = null;
  }
  return live;
}

// ---------------------------------------------------------------------------
// Bar rendering
// ---------------------------------------------------------------------------

function fmtTokens(n) {
  if (!(n > 0)) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtSec(ms) {
  return typeof ms === "number" && ms >= 0 ? `${(ms / 1000).toFixed(1)}s` : "-";
}

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const REDUCE_MOTION = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;
const segEls = new Map(); // key → persistent segment entry
let waitingDotsEl = null;

/* The three-dot "working" indicator — reads as intentional, never as a broken
 * number. One shared element so re-attaching keeps its stagger running. */
function waitingDots() {
  if (!waitingDotsEl) {
    waitingDotsEl = document.createElement("span");
    waitingDotsEl.className = "dots";
    for (let i = 0; i < 3; i += 1) waitingDotsEl.appendChild(document.createElement("i"));
  }
  return waitingDotsEl;
}

/* Feather-style stroke icons (24 viewBox, currentColor) — emoji rendered
 * inconsistently across platforms and clashed with the small text. */
const ICONS = {
  speed: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/>',
  ttft: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  e2e: '<path d="M4 12h16"/><path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/>',
  think: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  turn: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  session: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
  today: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

function iconSvg(key) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const body = ICONS[key];
  if (body) svg.innerHTML = body;
  return svg;
}

function buildSegEl(key, icon, label, value, cls, title) {
  const el = document.createElement("span");
  el.className = `seg${cls ? ` ${cls}` : ""}`;
  el.dataset.k = key;
  const ic = document.createElement("span");
  ic.className = "ic";
  ic.appendChild(iconSvg(key));
  el.appendChild(ic);
  if (label) el.appendChild(document.createTextNode(`${label} `));
  const strong = document.createElement("b");
  el.appendChild(strong);
  if (value instanceof Element) strong.appendChild(value);
  else strong.textContent = value;
  if (title) el.title = title;
  if (!REDUCE_MOTION && el.animate) {
    el.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 150, easing: EASE_OUT });
  }
  return el;
}

/* Value update with a 150ms rise+fade tick — a heartbeat that says "fresh".
 * Fires only when the text actually changed, so idle data never dances. */
function setSegValue(entry, value) {
  if (value instanceof Element) {
    if (entry.valueEl.firstChild !== value) entry.valueEl.replaceChildren(value);
    entry.text = null;
    return;
  }
  if (entry.text === value) return;
  entry.valueEl.textContent = value;
  entry.text = value;
  if (!REDUCE_MOTION && entry.valueEl.animate) {
    entry.valueEl.animate([{ opacity: 0.3, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 150, easing: EASE_OUT });
  }
}

const ORAL = "口径（体感生成速度）：Σ生成token（含推理） ÷ Σ(时长−首字)，解码窗≥250ms；无首字时刻的调用不计入速度";

/* Narrow-window fit: the strip never wraps, so when the window is too small
 * the lowest-value segments are hidden (⚡ always stays) instead of letting
 * glyphs clip into garbage. Re-runs on every render (~1.5s) — resize lag is
 * at most one poll. */
const DROP_ORDER = ["e2e", "think", "today", "session", "turn", "ttft"]; // hide-first first
let lastDropped = [];

function kindOf(el) {
  return (el && el.dataset && el.dataset.k) || "";
}

function fitSegments() {
  lastDropped = [];
  const segs = [...bar.querySelectorAll(".seg")];
  if (segs.length < 2) return;
  for (const key of DROP_ORDER) {
    const clipped = segs.some((s) => s.style.display !== "none" && s.scrollWidth > s.clientWidth + 1);
    if (!clipped) return;
    const target = segs.find((s) => s.style.display !== "none" && kindOf(s) === key);
    if (target) {
      target.style.display = "none";
      lastDropped.push(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Settings popover (the gear): pick which fields the strip shows. The choice
// persists in localStorage — no permissions, nothing leaves the page.
// ---------------------------------------------------------------------------

function loadHidden() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k) => FIELDS.some(([f]) => f === k)) : []);
  } catch {
    return new Set();
  }
}

function saveHidden() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...hiddenFields]));
  } catch {
    // storage unavailable — keep the choice for this session only
  }
}

function togglePanel() {
  if (panel) closePanel();
  else openPanel();
}

function openPanel() {
  closePanel();
  panel = document.createElement("div");
  panel.id = `${BAR_ID}-panel`;
  panel.dataset.piStatusbar = String(generation);
  const style = document.createElement("style");
  style.textContent = PANEL_CSS;
  panel.appendChild(style);
  const title = document.createElement("div");
  title.className = "t";
  title.textContent = "显示字段（勾选 = 显示）";
  panel.appendChild(title);
  for (const [key, label] of FIELDS) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !hiddenFields.has(key);
    box.addEventListener("change", () => {
      if (box.checked) hiddenFields.delete(key);
      else hiddenFields.add(key);
      saveHidden();
      void pollOnce(); // repaint the strip with the new visibility
    });
    row.appendChild(box);
    row.appendChild(document.createTextNode(label));
    panel.appendChild(row);
  }
  document.body.appendChild(panel);
  positionPanel();
  panelCloser = (event) => {
    if (event.type === "keydown") {
      if (event.key === "Escape") closePanel();
      return;
    }
    const target = event.target;
    if (panel && !panel.contains(target) && !(gearEl && gearEl.contains(target))) closePanel();
  };
  document.addEventListener("mousedown", panelCloser, true);
  document.addEventListener("keydown", panelCloser, true);
}

function closePanel() {
  if (panelCloser) {
    document.removeEventListener("mousedown", panelCloser, true);
    document.removeEventListener("keydown", panelCloser, true);
  }
  panelCloser = null;
  if (panel) panel.remove();
  panel = null;
}

function positionPanel() {
  if (!panel || !bar) return;
  const rect = bar.getBoundingClientRect();
  panel.style.left = "auto";
  panel.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;
  panel.style.bottom = `${Math.max(8, Math.round(window.innerHeight - rect.top + 6))}px`;
}

function render({ latest, turn, session, live }) {
  if (!bar) return;
  while (bar.firstChild) bar.removeChild(bar.firstChild);
  const style = document.createElement("style");
  style.textContent = BAR_CSS;
  bar.appendChild(style);

  const remote = remoteTotals ?? {};
  const today = remote.today ?? {};

  // ⚡ headline: LIVE while streaming — exact token deltas when the provider
  // streams usage progressively, else a ≈ estimate from the streaming message's
  // DOM text growth. Once the round settles it returns to the pooled value of
  // the NEWEST QUESTION — the scope the speed capsule and popover aggregate.
  const latestWindow = latest ? decodeOf(latest) : null;
  const latestTps = latestWindow === null ? null : Math.round(latest.gen / (latestWindow / 1000));
  // 思考吐字时长估算：渠道上报 reasoningTokens 即可 —— 时长 ≈ 思考token ÷
  // 解码速度（rea 是否并进 outputTokens 只影响速度分子，不影响本估算）。
  const thinkSec = latest && latest.rea !== null && latest.rea > 0 && latestTps !== null ? latest.rea / latestTps : null;
  const turnThinkSec = turn && turn.decodeTps !== null && turn.thinkRea > 0 ? turn.thinkRea / turn.decodeTps : null;

  // Desired segment list; the sync below reconciles the persistent DOM against
  // it so state changes transition instead of hard-swapping.
  const desired = [];
  const want = (key, icon, label, value, cls, title) => desired.push({ key, icon, label, value, cls, title });
  if (live.mode === "gen-exact") {
    want("speed", "⚡", "", `${live.rate} tok/s`, "speed live",
      `生成中 · 实时速率（usage 增量，≤${LIVE_WINDOW_MS / 1000}s 滑动平均）\n本轮结束后恢复整轮池化口径 · ${ORAL}`);
  } else if (live.mode === "gen-est") {
    want("speed", "⚡", "", `≈${live.rate} tok/s`, "speed live",
      `生成中 · 实时估算（流式消息文本增量 ÷ ${CHARS_PER_TOKEN}，粗略值，±误差大）\n本轮结束后恢复整轮池化口径 · ${ORAL}`);
  } else if (live.mode === "gen-wait") {
    want("speed", "⚡", "", waitingDots(), "live", "生成中 · 暂无 token 增量（等首字 / 工具执行 / 排队）；一有增量就显示实时速率。");
  } else if (turn && turn.calls > 0) {
    if (turn.decodeTps) {
      want("speed", "⚡", "", `${turn.decodeTps} tok/s`, "speed",
        `本轮解码速度（${turn.calls} 次调用池化${latestTps === null ? "" : `；最近一次调用单看 ${latestTps} tok/s`}）· ${ORAL}`);
    } else {
      want("speed", "⚡", "", "--", "warn", `本轮 ${turn.calls} 次调用里没有可用的解码窗（需有首字时刻且窗口 ≥250ms），不编造数字。`);
    }
  } else if (hub.records.size) {
    want("speed", "⚡", "", waitingDots(), "", "本轮还没有已完成的模型调用；第一次调用结束后这里显示本轮解码速度。");
  } else {
    want("speed", "⚡", "", "待首轮", "", "当前窗口还没有已渲染的模型回复；发一条消息后这里会出现解码速度。");
  }
  if (latest) {
    if (latest.ttftMs !== null && latest.ttftMs !== undefined) {
      want("ttft", "◷", "首字", fmtSec(latest.ttftMs), "", "最近一次调用的首字等待（TTFT，含思考流出时间）");
    }
    if (latest.durationMs !== null && latest.durationMs !== undefined) {
      want("e2e", "⋮", "E2E", fmtSec(latest.durationMs), "", "最近一次调用端到端墙钟（含等首字），仅供参考");
    }
  }
  const thinkLive = thinkWatch.active && thinkWatch.elapsedMs > 300;
  if (thinkLive) {
    want("think", "◈", "思考中", `${(thinkWatch.elapsedMs / 1000).toFixed(1)}s`, "think live",
      `思考进行中（秒表：检测到最后一个思考块在增长；结束后切换为 推理token÷速度 估算）\n思考 token 已计入 ⚡ 分子与解码窗`);
  } else if (thinkSec !== null) {
    want("think", "◈", "思考", `${thinkSec.toFixed(1)}s`, "",
      `最近一次调用思考吐字时长（估算）≈ ${latest.rea} 思考token ÷ ${latestTps} tok/s（假设思考与正文同速，±误差大）${turnThinkSec === null ? "" : `\n本轮思考合计 ≈ ${turnThinkSec.toFixed(1)}s`}\n思考 token 已计入 ⚡ 分子与解码窗`);
  }
  if (turn && turn.calls > 0 && turn.gen > 0) {
    want("turn", "▤", "本轮", `${fmtTokens(turn.gen)} tok`, "", `本轮（最新提问之后）累计生成 ${turn.gen} tokens；解码速度见左侧 ⚡`);
  }
  if (session && session.calls > 0) {
    want("session", "◧", "会话", `${fmtTokens(session.gen)} tok${session.decodeTps ? ` · ${session.decodeTps} t/s` : ""}`, "", "当前会话（已渲染部分）累计生成与解码速度");
  }
  if (today.gen > 0) {
    want("today", "⊛", "今日", `${fmtTokens(today.gen)} tok`, "", `今日全部会话累计生成（宿主用量接口，${today.calls ?? 0} 次调用；仅 token 合计，不含速度）`);
  }
  want("gear", "⚙", "", "", "gearbtn", "点击勾选要显示的字段（存在浏览器本地）");
  const visible = desired.filter((d) => d.key === "gear" || !hiddenFields.has(d.key));

  lastSnapshot = {
    headline:
      live.mode === "gen-exact" ? `${live.rate} tok/s`
      : live.mode === "gen-est" ? `≈${live.rate} tok/s`
      : live.mode === "gen-wait" ? "…"
      : turn && turn.calls > 0
        ? turn.decodeTps ? `${turn.decodeTps} tok/s` : "--"
        : hub.records.size ? "…" : "待首轮",
    turnCalls: turn ? turn.calls : 0,
    turnGen: turn ? turn.gen : 0,
    turnTps: turn ? turn.decodeTps : null,
    latestTps,
    latestGen: latest ? latest.gen : null,
    latestTtftMs: latest ? latest.ttftMs : null,
    latestDurationMs: latest ? latest.durationMs : null,
    latestThinkSec: thinkSec,
    latestOut: latest ? latest.out : null,
    latestRea: latest ? latest.rea : null,
    sessionGen: session ? session.gen : 0,
    sessionTps: session ? session.decodeTps : null,
    live: { mode: live.mode, rate: live.rate, source: live.source, flightGen: live.flightGen, domLen: live.domLen },
    thinkLive: { active: thinkWatch.active, elapsedMs: thinkWatch.elapsedMs },
  };
  // Sync the persistent segment elements against the desired list (order,
  // content, classes) — updating in place is what lets values transition
  // instead of hard-swapping on every rebuild.
  const styleEl = bar.firstElementChild && bar.firstElementChild.tagName === "STYLE" ? bar.firstElementChild : null;
  let ref = styleEl ? styleEl.nextSibling : bar.firstChild;
  for (const d of visible) {
    let entry = segEls.get(d.key);
    if (!entry) {
      const root = buildSegEl(d.key, d.icon, d.label, d.value, d.cls, d.title);
      entry = { root, valueEl: root.querySelector("b"), cls: d.cls, title: d.title, text: d.value instanceof Element ? null : d.value };
      if (d.key === "gear") {
        gearEl = root;
        root.addEventListener("click", togglePanel);
      }
      segEls.set(d.key, entry);
    } else {
      if (entry.cls !== d.cls) {
        entry.root.className = `seg${d.cls ? ` ${d.cls}` : ""}`;
        entry.cls = d.cls;
      }
      if (entry.title !== d.title) {
        entry.root.title = d.title;
        entry.title = d.title;
      }
      setSegValue(entry, d.value);
    }
    if (entry.root !== ref) bar.insertBefore(entry.root, ref);
    ref = entry.root.nextSibling;
    entry.root.style.display = "";
  }
  const keep = new Set(visible.map((d) => d.key));
  for (const [key, entry] of [...segEls]) {
    if (!keep.has(key)) {
      entry.root.remove();
      segEls.delete(key);
      if (key === "gear") gearEl = null;
    }
  }
  fitSegments();
}

/* DOM 侦察：宿主把「思考」渲染成什么形状？有稳定特征才能做流式思考秒表。
 * 只数数量、取类名样本和文本长度，不读内容。 */
function thinkProbe() {
  const out = { think: 0, reason: 0, details: 0, summary: 0, samples: [] };
  try {
    out.think = document.querySelectorAll('[class*="think" i]').length;
    out.reason = document.querySelectorAll('[class*="reason" i]').length;
    out.details = document.querySelectorAll("details").length;
    out.summary = document.querySelectorAll("summary").length;
    const nodes = [...document.querySelectorAll('[class*="think" i], details')].slice(0, 8);
    out.samples = nodes.map((n) => {
      const cls = typeof n.className === "string" ? n.className : "";
      return `${n.tagName.toLowerCase()}.${cls.slice(0, 70) || "-"} len=${n.textContent.length}`;
    });
  } catch {
    // probe is best-effort
  }
  return out;
}

async function pollOnce() {
  tickCount += 1;
  let pollError = null;
  try {
    refreshRecords(tickCount % 2 === 1 || Date.now() < liveActiveUntil);
    const stats = {
      latest: latestStats(),
      turn: turnStats(),
      session: sessionStats(),
      live: liveState(),
    };
    render(stats); // render with the data we already have; never blocked by the call
    try {
      const remote = await Promise.race([
        call("statusbar"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("statusbar timeout")), 2000)),
      ]);
      if (remote && typeof remote === "object" && !remote.error) remoteTotals = remote;
    } catch {
      // host mid-reload or slow — keep the last totals
    }
    render(stats); // remote totals (今日) may have landed — cheap repaint
  } catch (error) {
    pollError = String(error && error.message ? error.message : error);
  }
  if (tickCount % 20 === 3) {
    // periodic geom report (every ~30s) so a silent failure still leaves a
    // trace in the host log.
    try {
      await Promise.race([
        call("report", {
          geom: lastGeom,
          lastError: pollError,
          bar: lastSnapshot,
          tNode: Boolean(hub.transcriptNode && hub.transcriptNode.isConnected),
          dropped: lastDropped,
          hidden: [...hiddenFields],
          thinkProbe: thinkProbe(),
          anchorConnected: Boolean(anchor && anchor.isConnected),
          records: hub.records.size,
          found: hub.stats.found,
          visited: hub.stats.visited,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("report timeout")), 2000)),
      ]);
    } catch {
      // diagnostics are best-effort
    }
  }
}

export function onLoad(pi) {
  host = pi;
  generation += 1;
  document.querySelectorAll("[data-pi-statusbar]").forEach((el) => el.remove());

  bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.dataset.piStatusbar = String(generation);
  const style = document.createElement("style");
  style.textContent = BAR_CSS;
  bar.appendChild(style);

  // Hidden zero-size anchor inside the composer toolbar: the tracking base
  // for positioning AND the React-tree scan starting node.
  try {
    pi.slots.register({
      slot: "composerControl",
      positions: ["left"], // the left toolbar slot is the proven-visible one
      component: () =>
        React.createElement("span", {
          className: "pi-statusbar-anchor",
          ref: (node) => {
            anchor = node;
            hub.node = node;
          },
        }),
    });
  } catch {
    anchor = null;
  }

  document.body.appendChild(bar);
  alive = true;
  posTimer = setInterval(frame, 150);
  frame();
  pollTimer = setInterval(pollOnce, TICK_MS);
  pollOnce();
}

export function onUnload() {
  alive = false;
  if (posTimer) clearInterval(posTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (lastSpacerEl) {
  if (spacerObserver) {
    spacerObserver.disconnect();
    spacerObserver = null;
  }
    try {
      lastSpacerEl.style.marginBottom = "";
    } catch {
      // element may be gone with the page
    }
    lastSpacerEl = null;
  }
  if (bar) bar.remove();
  bar = null;
  anchor = null;
  hub.node = null;
  remoteTotals = null;
  hub.transcriptNode = null;
  closePanel();
  gearEl = null;
  liveActiveUntil = 0;
  segEls.clear();
  waitingDotsEl = null;
  resetLive();
  host = null;
}
