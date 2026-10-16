const qs = new URLSearchParams(location.search);
const TOKEN = qs.get('token') || '';
const BASE = location.pathname.startsWith('/session/') ? '/' : location.pathname.replace(/[^/]*$/, '');
const API = (p) => p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);

const TOOL_NAMES = { openchamber: 'OpenChamber', 'pi-desktop': 'PI-Desktop', zcode: 'ZCode', dsh: 'DSH' };
const STATUS_ICON = { running:'🔵', idle:'⚪', completed:'✅', error:'❌', cancelled:'🚫', stuck:'⏳', crashed:'💥', blocked:'🟠', offline:'⚫' };

function fmtAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m === 0) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}
function fmtTokens(n) {
  if (!n) return '-';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

async function refresh() {
  try {
    const [sessRes, healthRes] = await Promise.all([
      fetch(API('/api/sessions')).then(r => { if (r.status === 401) throw new Error('unauthorized'); return r.json(); }),
      fetch(API('/api/health')).then(r => r.json()).catch(() => null),
    ]);
    if (sessRes.breaker) document.getElementById('breaker').style.display = 'block';
    renderHealth(healthRes);
    renderSessions(sessRes.sessions || []);
    document.getElementById('updatedAt').textContent = '更新于 ' + new Date().toLocaleTimeString();
  } catch (e) {
    if (String(e).includes('unauthorized')) {
      document.getElementById('content').innerHTML = '<div class="warn">🔒 未授权：请在 URL 后加 <code>?token=…</code></div>';
    }
  }
}

function renderHealth(h) {
  const el = document.getElementById('health');
  if (!h || !h.adapters) { el.innerHTML = ''; return; }
  el.innerHTML = Object.entries(h.adapters).map(([name, a]) =>
    `<span><span class="dot" style="background:${a.online ? 'var(--green)' : 'var(--grey)'}"></span>${TOOL_NAMES[name] || name}</span>`
  ).join('');
}

function renderSessions(rows) {
  const byProject = new Map();
  for (const r of rows) {
    const key = r.projectName || '未知项目';
    (byProject.get(key) || byProject.set(key, []).get(key)).push(r);
  }
  const order = { running: 0, stuck: 1, blocked: 2, crashed: 3, error: 4, idle: 5, completed: 6, cancelled: 7, offline: 8 };
  const content = document.getElementById('content');
  if (rows.length === 0) { content.innerHTML = '<div class="muted">暂无会话数据（等待采集或调整 token）</div>'; return; }
  let html = '';
  for (const [proj, list] of [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.lastTurnAt - a.lastTurnAt);
    html += `<div class="proj"><h2>📁 ${esc(proj)}</h2><table><thead><tr>
      <th>状态</th><th>工具</th><th>任务</th><th class="hide-mobile">最近活动</th><th class="hide-mobile">Token</th><th class="hide-mobile">模型</th>
    </tr></thead><tbody>`;
    for (const r of list) {
      const url = `/session/${r.tool}/${encodeURIComponent(r.sessionId)}?token=${encodeURIComponent(TOKEN)}`;
      html += `<tr>
        <td class="s-${esc(r.status)}">${STATUS_ICON[r.status] || '•'} ${esc(r.status)}</td>
        <td><span class="badge">${TOOL_NAMES[r.tool] || r.tool}</span></td>
        <td><a class="title" href="${url}">${esc(r.title)}</a></td>
        <td class="hide-mobile muted">${fmtAgo(r.lastTurnAt)}</td>
        <td class="hide-mobile muted">${fmtTokens(r.totalTokens)}</td>
        <td class="hide-mobile muted">${esc(r.model || '-')}</td>
      </tr>`;
    }
    html += '</tbody></table></div>';
  }
  content.innerHTML = html;
}

refresh();
setInterval(refresh, 5000);
