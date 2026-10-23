// Work Status 一行状态条：按容器宽度自适应布局，窄容器自动换行不裁切
// 关键：DOM 只构建一次，之后只改 textContent / class
import { connectHost } from "@openchamber/sdk";
import { fmtTokens, fmtMs, fmtTps, pct, esc } from "../shared/format.mjs";

const host = connectHost();
const root = document.getElementById("root");
let session = null;
let timer = null;
let inFlight = false;
let lastTpsShown = null;
let view = null;
let refs = null;

host.onReady((ctx) => {
  session = ctx.session ?? null;
  try { host.setHeight(76); } catch {}
  tick();
});
host.onSession((s) => {
  session = s;
  lastTpsShown = null;
  tick();
});
if (!timer) timer = setInterval(() => { if (!inFlight) tick(); }, 1000);

async function tick() {
  if (!session?.id) { showMessage("Speed: 无打开的会话"); return; }
  inFlight = true;
  let data = null;
  try {
    const r = await host.serviceRequest({
      method: "GET",
      path: `/stats?sessionId=${encodeURIComponent(session.id)}`,
    });
    if (r && typeof r.status === "number") {
      data = r.status < 400
        ? (typeof r.body === "string" ? JSON.parse(r.body) : r.body)
        : { ok: false, error: `HTTP ${r.status}` };
    }
  } catch { data = null; }
  inFlight = false;
  render(data, session);
}

function buildCard() {
  root.innerHTML = `
    <div class="frost">
      <div class="head">
        <span class="breath" data-ref="dot"></span>
        <span class="big" data-ref="tps">—</span>
        <span class="unit">tok/s</span>
        <span class="chip" data-ref="chip">—</span>
      </div>
      <div class="metrics">
        <span class="m"><span class="lbl">TTFT</span><span class="kv" data-ref="ttft">—</span></span>
        <span class="m"><span class="lbl">生成</span><span class="kv" data-ref="gen">—</span></span>
      </div>
      <div class="metrics">
        <span class="m"><span class="lbl">本轮</span><span class="kv" data-ref="turn">—</span></span>
        <span class="m"><span class="lbl">会话</span><span class="kv" data-ref="sess">—</span></span>
      </div>
    </div>`;
  const q = (k) => root.querySelector(`[data-ref="${k}"]`);
  refs = {
    dot: q("dot"), tps: q("tps"), chip: q("chip"),
    ttft: q("ttft"), gen: q("gen"), turn: q("turn"), sess: q("sess"),
  };
  view = "card";
}

function showMessage(msg) {
  if (view === "message" && refs?.msg?.textContent === msg) return;
  root.innerHTML = `<div class="frost"><span class="muted" data-ref="msg">${esc(msg)}</span></div>`;
  refs = { msg: root.querySelector('[data-ref="msg"]') };
  view = "message";
}

function chipOf(tps, running) {
  if (running) return ["生成中", ""];
  if (tps == null || !Number.isFinite(tps)) return ["—", ""];
  if (tps >= 70) return ["快", "fast"];
  if (tps >= 40) return ["中", "mid"];
  return ["慢", "slow"];
}

function colorOf(tps, running) {
  if (running) return "var(--oc-primary, #3b82f6)";
  if (tps == null || !Number.isFinite(tps)) return "var(--oc-muted, #999)";
  if (tps >= 70) return "var(--oc-success, #22a06b)";
  if (tps >= 40) return "var(--oc-warning, #e2a336)";
  return "var(--oc-error, #d64545)";
}

function render(data, sess) {
  if (!sess) return showMessage("Speed: 无打开的会话");
  if (!data || data.ok === false) {
    return showMessage(`Speed: service 不可用（${data?.error ?? "未连接"}）`);
  }
  const t = data.turn ?? {};
  const s = data.session ?? {};
  const last = data.last ?? {};

  if (!t.requests && !s.rounds) {
    return showMessage("该会话还没有完成的对话 —— 发一条消息后就会显示");
  }

  if (view !== "card") buildCard();

  const running = !!t.running;
  const tpsVal = t.tps ?? last?.tps ?? null;
  const tpsShown = fmtTps(tpsVal);
  const genMs = t.genMs || last?.decodeMs || null;
  const ttft = t.ttftLast ?? last?.ttftMs ?? null;

  if (lastTpsShown !== tpsShown) {
    lastTpsShown = tpsShown;
    refs.tps.textContent = tpsShown;
    refs.tps.style.color = colorOf(tpsVal, running);
    refs.tps.classList.remove("pop");
    void refs.tps.offsetWidth;
    refs.tps.classList.add("pop");
  } else {
    refs.tps.style.color = colorOf(tpsVal, running);
  }

  refs.dot.className = running ? "breath live" : "breath";

  const [label, cls] = chipOf(tpsVal, running);
  refs.chip.textContent = label;
  refs.chip.className = cls ? `chip ${cls}` : "chip";

  refs.ttft.textContent = fmtMs(ttft);
  refs.gen.textContent = fmtMs(genMs);

  const turnTotal = (t.inTok ?? 0) + (t.outTok ?? 0);
  const sessTotal = (s.inTok ?? 0) + (s.outTok ?? 0);
  refs.turn.textContent = `${fmtTokens(turnTotal)}·${pct(t.hitRate)}·${t.requests ?? 0}次`;
  refs.sess.textContent = `${fmtTokens(sessTotal)}·${s.rounds ?? 0}轮`;
}
