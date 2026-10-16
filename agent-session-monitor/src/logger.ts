import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
let logFile: string | null = null;

export function setLogFile(p: string): void {
  logFile = p;
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

export function setLevel(l: LogLevel): void {
  minLevel = l;
}

function line(level: Exclude<LogLevel, 'debug'> | 'debug', msg: string, extra?: unknown): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const ts = new Date().toISOString();
  const text = `${ts} [${level}] ${msg}${extra !== undefined ? ' ' + safe(extra) : ''}`;
  process.stdout.write(text + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, text + '\n'); } catch { /* 日志失败不中断 */ }
  }
}

function safe(v: unknown): string {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** 打印脱敏 URL（隐藏 query） */
export function safeUrl(u: string): string {
  try { const url = new URL(u); return `${url.protocol}//${url.host}${url.pathname}`; }
  catch { return '<url>'; }
}

export const logger = {
  debug: (msg: string, extra?: unknown) => line('debug', msg, extra),
  info: (msg: string, extra?: unknown) => line('info', msg, extra),
  warn: (msg: string, extra?: unknown) => line('warn', msg, extra),
  error: (msg: string, extra?: unknown) => line('error', msg, extra),
};
