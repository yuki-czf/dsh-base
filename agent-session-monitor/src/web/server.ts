import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import type { SessionRecord, ToolName, AdapterHealth } from '../types.js';
import type { DB } from '../db.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

export interface WebDeps {
  cfg: {
    port: number; host: string;
    auth: { enabled: boolean; token: string };
  };
  db: DB;
  getSessions: () => SessionRecord[];
  getSession: (tool: ToolName, id: string) => SessionRecord | undefined;
  getHealth: () => Record<string, AdapterHealth>;
  breakerActive: () => boolean;
  historyDaysMs: () => number;
}

interface AuthedRequest { url?: string; query: Record<string, unknown>; headers: Record<string, unknown> }

export async function startWeb(deps: WebDeps): Promise<{ stop: () => Promise<void>; port: number }> {
  const app = Fastify({ logger: false });
  await app.register(fastifyStatic, { root: PUBLIC_DIR });

  const authed = (req: AuthedRequest): boolean => {
    if (!deps.cfg.auth.enabled) return true;
    const q = req.query?.token;
    const h = req.headers?.['x-monitor-token'];
    return q === deps.cfg.auth.token || h === deps.cfg.auth.token;
  };

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url;
    if (!url.startsWith('/') ) return;
    const needsAuth = url === '/' || url.startsWith('/session/') || url.startsWith('/api/');
    if (!needsAuth) return;
    if (!authed(req as unknown as AuthedRequest)) {
      if (url.startsWith('/api/')) {
        void reply.code(401).send({ error: 'unauthorized' });
      } else {
        void reply.code(401).type('text/html; charset=utf-8').send(unauthorizedPage());
      }
    }
  });

  app.get('/api/sessions', async () => {
    const cutoff = Date.now() - deps.historyDaysMs();
    const rows = deps.getSessions().filter(s => s.lastTurnAt >= cutoff || s.status === 'running');
    return { sessions: rows, breaker: deps.breakerActive(), serverTime: Date.now() };
  });

  app.get('/api/sessions/:tool/:id', async (req, reply) => {
    const { tool, id } = req.params as { tool: ToolName; id: string };
    const s = deps.getSession(tool, id);
    if (!s) return reply.code(404).send({ error: 'not found' });
    return s;
  });

  app.get('/api/health', async () => {
    return { adapters: deps.getHealth(), breaker: deps.breakerActive(), serverTime: Date.now() };
  });

  app.get('/session/:tool/:id', async (_req, reply) => {
    return reply.type('text/html').send(fs.readFileSync(path.join(PUBLIC_DIR, 'session.html')));
  });

  await app.listen({ port: deps.cfg.port, host: deps.cfg.host });
  return { stop: async () => { await app.close(); }, port: deps.cfg.port };
}

function unauthorizedPage(): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>401</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#ddd}
code{background:#222;padding:4px 8px;border-radius:6px}</style></head>
<body><div><h1>🔒 未授权</h1><p>请携带 token 访问：<code>?token=你的token</code></p></div></body></html>`;
}
