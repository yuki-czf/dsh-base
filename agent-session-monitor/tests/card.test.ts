import { describe, it, expect } from 'vitest';
import { buildCard, buildStatusCard, type StatusRow } from '../src/notify/card.js';
import type { NotifyEvent } from '../src/types.js';

describe('卡片模板', () => {
  it('完成卡含必含字段与按钮', () => {
    const ev: NotifyEvent = {
      kind: 'turn', tool: 'pi-desktop', sessionId: 'abc', projectName: 'dsh-base',
      title: '排查登录报错', status: 'completed', durationMs: 1380_000, tokens: 89_000,
      model: 'glm-5.3', excerpt: '定位为聚合投递延迟', detailUrl: 'http://192.168.1.5:7788/session/pi-desktop/abc',
    };
    const card = buildCard(ev) as { msg_type: string; card: { header: { template: string; title: { content: string } }; elements: Array<{ tag: string; text?: { content: string }; actions?: Array<{ actions: Array<{ url: string }> }> }> } };
    expect(card.msg_type).toBe('interactive');
    expect(card.card.header.template).toBe('green');
    expect(card.card.header.title.content).toContain('PI-Desktop');
    const md = card.card.elements.find(e => e.tag === 'div')?.text?.content ?? '';
    expect(md).toContain('dsh-base');
    expect(md).toContain('排查登录报错');
    expect(md).toContain('89K');
    expect(md).toContain('定位为聚合投递延迟');
    const btn = (card.card.elements.find(e => e.tag === 'action') as { actions: Array<{ url: string }> })?.actions?.[0];
    expect(btn?.url).toContain('/session/pi-desktop/abc');
  });

  it('失败卡为红色模板，错误码出现', () => {
    const ev: NotifyEvent = { kind: 'turn', tool: 'zcode', sessionId: 'x', projectName: 'p', title: 't', status: 'error', errorCode: 'PI_AI_ERROR', detailUrl: '/' };
    const card = buildCard(ev) as { card: { header: { template: string }; elements: Array<{ text?: { content: string } }> } };
    expect(card.card.header.template).toBe('red');
    const md = card.card.elements[0]?.text?.content ?? '';
    expect(md).toContain('PI_AI_ERROR');
  });

  it('状态查询卡按项目分组', () => {
    const rows: StatusRow[] = [
      { tool: 'dsh', projectName: 'alpha', title: 'a1', status: 'running', lastTurnAt: Date.now(), sessionId: '1', detailUrl: '/' },
      { tool: 'zcode', projectName: 'alpha', title: 'a2', status: 'completed', lastTurnAt: Date.now(), sessionId: '2', detailUrl: '/' },
      { tool: 'openchamber', projectName: 'beta', title: 'b1', status: 'running', lastTurnAt: Date.now(), sessionId: '3', detailUrl: '/' },
    ];
    const card = buildStatusCard(rows) as { card: { elements: Array<{ text?: { content: string } }> } };
    const md = card.card.elements[0]?.text?.content ?? '';
    expect(md.match(/📁 alpha/g)?.length).toBe(1);
    expect(md.match(/📁 beta/g)?.length).toBe(1);
    expect(md).toContain('a1');
    expect(md).toContain('b1');
  });

  it('空状态回复「当前无运行中会话」', () => {
    const card = buildStatusCard([]) as { card: { elements: Array<{ text?: { content: string } }> } };
    expect(card.card.elements[0]?.text?.content).toContain('当前无运行中会话');
  });
});
