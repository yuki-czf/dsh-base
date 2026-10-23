// 共享格式化 + 渲染小工具（panel / status 各自 bundle 一份）
export function fmtTokens(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return Math.round(n / 1e4) + "万";
  return String(Math.round(n));
}

export function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  if (s >= 100) return Math.round(s) + "s";
  if (s >= 10) return s.toFixed(1) + "s";
  return s.toFixed(2) + "s";
}

export function fmtTps(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
}

// zcode 阈值：≥70 绿、40–70 黄、<40 红（仅完成值着色）
export function tpsColor(v, running) {
  if (running) return "var(--oc-primary, var(--oc-fg, inherit))";
  if (v == null || !Number.isFinite(v)) return "var(--oc-muted, #888)";
  if (v >= 70) return "var(--oc-success, #22a06b)";
  if (v >= 40) return "var(--oc-warning, #e2a336)";
  return "var(--oc-error, #d64545)";
}

export function pct(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v * 100) + "%";
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
