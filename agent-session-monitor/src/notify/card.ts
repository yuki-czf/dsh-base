import type { NotifyEvent } from '../types.js';

const TOOLS: Record<string, string> = {
  openchamber: 'OpenChamber',
  'pi-desktop': 'PI-Desktop',
  zcode: 'ZCode',
  dsh: 'DSH Desktop',
};

function fmtDuration(ms?: number): string {
  if (!ms || ms < 0) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${s % 60} 秒`;
  return `${Math.floor(m / 60)} 时 ${m % 60} 分`;
}

function fmtTokens(n?: number): string {
  if (!n) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

const STATUS_META: Record<string, { icon: string; label: string }> = {
  completed: { icon: '✅', label: '成功' },
  error: { icon: '❌', label: '失败' },
  cancelled: { icon: '🚫', label: '已取消' },
  stuck: { icon: '⏳', label: '疑似卡住' },
  crashed: { icon: '💥', label: '异常中断' },
  digest: { icon: '📦', label: '离线积压' },
};

function statusIcon(status: string): string {
  return STATUS_META[status]?.icon ?? 'ℹ️';
}

function elementText(tag: string, content: string): Record<string, unknown> {
  return { tag, content };
}

/** 单回合/异常卡片（飞书 interactive card JSON） */
export function buildCard(ev: NotifyEvent): Record<string, unknown> {
  const meta = STATUS_META[ev.status] ?? { icon: 'ℹ️', label: ev.status };
  const lines: string[] = [];
  lines.push(`**项目：** ${ev.projectName}`);
  lines.push(`**任务：** ${ev.title}`);
  lines.push(`**结果：** ${meta.label} · 耗时 ${fmtDuration(ev.durationMs)}`);
  const tokens = fmtTokens(ev.tokens);
  if (ev.tokens || ev.model) lines.push(`**Token：** ${tokens}${ev.model ? ` · 模型 ${ev.model}` : ''}`);
  if (ev.errorCode) lines.push(`**错误码：** ${ev.errorCode}`);
  if (ev.excerpt) lines.push(`**摘要：** ${ev.excerpt}`);
  if (ev.items && ev.items.length > 0) {
    lines.push('**包含条目：**');
    for (const it of ev.items.slice(0, 8)) {
      lines.push(`- ${statusIcon(it.status)} [${TOOLS[it.tool] ?? it.tool}] ${it.projectName} · ${it.title}`);
    }
    if (ev.items.length > 8) lines.push(`- …等共 ${ev.items.length} 条`);
  }

  const elements: Record<string, unknown>[] = [
    { tag: 'div', text: elementText('lark_md', lines.join('\n')) },
    {
      tag: 'action',
      actions: [{
        tag: 'button',
        text: elementText('plain_text', '查看详情'),
        type: 'primary',
        url: ev.detailUrl,
      }],
    },
  ];

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: ev.status === 'completed' ? 'green' : ev.status === 'stuck' ? 'yellow' : 'red',
        title: elementText('plain_text', `${meta.icon} 会话${meta.label} · ${TOOLS[ev.tool] ?? ev.tool}`),
      },
      elements,
    },
  };
}

/** 「状态」查询回复卡片（按项目分组） */
export interface StatusRow {
  tool: string;
  projectName: string;
  title: string;
  status: string;
  lastTurnAt: number;
  sessionId: string;
  detailUrl: string;
}

export function buildStatusCard(rows: StatusRow[]): Record<string, unknown> {
  const byProject = new Map<string, StatusRow[]>();
  for (const r of rows) {
    const list = byProject.get(r.projectName) ?? [];
    list.push(r);
    byProject.set(r.projectName, list);
  }
  const lines: string[] = [];
  if (rows.length === 0) {
    lines.push('当前无运行中会话。');
  } else {
    for (const [proj, list] of byProject) {
      lines.push(`**📁 ${proj}**`);
      for (const r of list) {
        const ago = Math.max(0, Math.round((Date.now() - r.lastTurnAt) / 60000));
        lines.push(`- ${statusIcon(r.status)} [${TOOLS[r.tool] ?? r.tool}] ${r.title}（${ago === 0 ? '刚刚' : ago + ' 分钟前'}）`);
      }
    }
  }
  return {
    msg_type: 'interactive',
    card: {
      header: {
        template: rows.some(r => r.status === 'running') ? 'blue' : 'grey',
        title: elementText('plain_text', '📋 当前会话状态'),
      },
      elements: [
        { tag: 'div', text: elementText('lark_md', lines.join('\n')) },
        {
          tag: 'action',
          actions: [{ tag: 'button', text: elementText('plain_text', '打开面板'), type: 'default', url: '/' }],
        },
      ],
    },
  };
}

export function buildHelpCard(): Record<string, unknown> {
  return {
    msg_type: 'interactive',
    card: {
      header: { template: 'blue', title: elementText('plain_text', '🤖 会话监控机器人') },
      elements: [{
        tag: 'div',
        text: elementText('lark_md', [
          '**可用指令：**',
          '- `状态` — 查看当前全部会话状态（按项目分组）',
          '- `帮助` — 显示本说明',
          '',
          '会话完成/失败时会自动推送卡片通知。',
        ].join('\n')),
      }],
    },
  };
}
