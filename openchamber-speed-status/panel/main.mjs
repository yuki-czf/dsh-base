// 右栏面板（macOS 风格）
// 关键：骨架只建一次；每秒只更新文本/宽度；曲线路径在数据变化时才替换
import { connectHost } from "@openchamber/sdk";
import { fmtTokens, fmtMs, fmtTps, pct, esc } from "../shared/format.mjs";

const host = connectHost();
const root = document.getElementById("root");
let session = null;
let timer = null;
let inFlight = false;
let lastTpsShown = null;
let lastCurveKey = "";
let lastModelsKey = "";
let view = null;
let refs = null;

host.onReady((ctx) => { session = ctx.session ?? null; tick(); });
host.onSession((s) => {
  session = s;
  lastTpsShown = null;
  lastCurveKey = "";
  lastModelsKey = "";
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

function showMessage(msg) {
  if (view === "message" && refs?.msg?.textContent === msg) return;
  root.innerHTML = `<div class="frost"><span class="muted" data-ref="msg">${esc(msg)}</span></div>`;
  refs = { msg: root.querySelector('[data-ref="msg"]') };
  view = "message";
}

function buildCard() {
  root.innerHTML = `
    <div class="frost">
      <div class="row">
        <span class="breath" data-ref="dot"></span>
        <span class="big" data-ref="tps">—</span>
        <span class="unit">tok/s</span>
        <span class="spacer"></span>
        <span class="chip" data-ref="chip">—</span>
      </div>

      <div class="meter"><i data-ref="meter" style="width:0%"></i></div>

      <div class="row">
        <span class="m"><span class="lbl">P95</span><span class="kv" data-ref="peak">—</span></span>
        <span class="m"><span class="lbl">TTFT</span><span class="kv" data-ref="ttft">—</span></span>
        <span class="m"><span class="lbl">生成</span><span class="kv" data-ref="gen">—</span></span>
      </div>

      <div class="sparkbox" data-ref="sparkbox">
        <svg class="spark" viewBox="0 0 300 40" preserveAspectRatio="none">
          <path class="fill" data-ref="area" d=""/>
          <path class="line" data-ref="line" d=""/>
        </svg>
        <div class="spark-empty" data-ref="sparkEmpty">还不够样本画曲线</div>
      </div>

      <div class="row">
        <span class="m"><span class="lbl">本轮</span><span class="kv" data-ref="turn">—</span></span>
        <span class="spacer"></span>
        <span class="m"><span class="lbl">会话</span><span class="kv" data-ref="sess">—</span></span>
      </div>

      <div data-ref="modelsWrap" style="display:none">
        <div class="lbl" style="margin-top:4px;text-transform:uppercase;letter-spacing:.04em;font-size:9px">按模型</div>
        <table>
          <thead><tr><th>模型</th><th>请求</th><th>t/s</th><th>TTFT</th></tr></thead>
          <tbody data-ref="modelsBody"></tbody>
        </table>
      </div>
    </div>`;

  const q = (k) => root.querySelector(`[data-ref="${k}"]`);
  refs = {
    dot: q("dot"), tps: q("tps"), chip: q("chip"), meter: q("meter"),
    peak: q("peak"), ttft: q("ttft"), gen: q("gen"),
    area: q("area"), line: q("line"), sparkEmpty: q("sparkEmpty"),
    turn: q("turn"), sess: q("sess"),
    modelsWrap: q("modelsWrap"), modelsBody: q("modelsBody"),
  };
  view = "card";
  lastCurveKey = "";
  lastModelsKey = "";
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

function dotCls(tps) {
  if (tps == null || !Number.isFinite(tps)) return "dot";
  if (tps >= 70) return "dot fast";
  if (tps >= 40) return "dot mid";
  return "dot slow";
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

  // 峰值用 P95，避免离群值把条压扁
  const sample = (data.recent ?? []).map((r) => r.tps).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const p95 = sample.length ? sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.95))] : 0;
  const peak = Math.max(p95, tpsVal ?? 0, 1);
  refs.peak.textContent = fmtTps(peak);
  refs.meter.style.width = `${Math.max(2, Math.min(100, ((tpsVal ?? 0) / peak) * 100))}%`;

  refs.ttft.textContent = fmtMs(t.ttftLast ?? last?.ttftMs);
  refs.gen.textContent = fmtMs(t.genMs || last?.decodeMs);

  // 曲线：值序列没变就不碰 DOM（避免描边动画重播）
  const vals = (data.recent ?? []).filter((r) => Number.isFinite(r.tps)).map((r) => r.tps).reverse();
  const key = vals.map((v) => v.toFixed(1)).join("|");
  if (key !== lastCurveKey) {
    lastCurveKey = key;
    if (vals.length < 2) {
      refs.line.setAttribute("d", "");
      refs.area.setAttribute("d", "");
      refs.sparkEmpty.style.display = "";
    } else {
      refs.sparkEmpty.style.display = "none";
      const max = Math.max(...vals), min = Math.min(...vals, 0);
      const span = Math.max(1, max - min);
      const n = vals.length;
      const X = (i) => (i / (n - 1)) * 300;
      const Y = (v) => 36 - ((v - min) / span) * 30 - 3;
      const d = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" L");
      refs.line.setAttribute("d", `M${d}`);
      refs.area.setAttribute("d", `M${d} L300,40 L0,40 Z`);
      // 重放描边动画
      refs.line.style.animation = "none";
      refs.area.style.animation = "none";
      void refs.line.getBoundingClientRect();
      refs.line.style.animation = "";
      refs.area.style.animation = "";
    }
  }

  const turnTotal = (t.inTok ?? 0) + (t.outTok ?? 0);
  const sessTotal = (s.inTok ?? 0) + (s.outTok ?? 0);
  refs.turn.textContent = `${fmtTokens(turnTotal)} · ${pct(t.hitRate)} · ${t.requests ?? 0}次`;
  refs.sess.textContent = `${fmtTokens(sessTotal)} · ${s.rounds ?? 0}轮`;

  // 模型表：内容没变就不重建
  const models = data.models ?? [];
  const mKey = models.map((m) => `${m.model}:${m.requests}:${fmtTps(m.tps)}`).join("|");
  if (mKey !== lastModelsKey) {
    lastModelsKey = mKey;
    if (!models.length) {
      refs.modelsWrap.style.display = "none";
    } else {
      refs.modelsWrap.style.display = "";
      refs.modelsBody.innerHTML = models.map((m) => `
        <tr>
          <td><span class="${dotCls(m.tps)}"></span>${esc(String(m.model ?? "—").replace(/^[^/]*\//, ""))}</td>
          <td>${m.requests}</td>
          <td>${fmtTps(m.tps)}</td>
          <td>${fmtMs(m.ttftAvg)}</td>
        </tr>`).join("");
    }
  }
}
