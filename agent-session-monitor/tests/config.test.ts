import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tempConfig(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-cfg-'));
  const p = path.join(dir, 'config.yaml');
  fs.writeFileSync(p, yaml);
  return p;
}

describe('config 校验', () => {
  it('合法配置加载成功', () => {
    const p = tempConfig(`
server: { port: 7890, host: "0.0.0.0", auth: { enabled: true, token: "abc123" } }
baseUrl: "http://192.168.1.5:7890"
`);
    const cfg = loadConfig({ } as never) || loadConfig();
    // 直接用 env 指向该文件
    process.env.CONFIG_PATH = p;
    delete requireCacheFor(p);
    const cfg2 = loadConfig();
    expect(cfg2.server.port).toBe(7890);
    expect(cfg2.server.auth.token).toBe('abc123');
    expect(cfg2.baseUrl).toBe('http://192.168.1.5:7890');
    void cfg;
  });

  it('端口使用被监控工具端口时启动报错', () => {
    const p = tempConfig(`
server: { port: 57123, auth: { enabled: false, token: "x" } }
`);
    process.env.CONFIG_PATH = p;
    expect(() => loadConfig()).toThrow(/必须避开/);
  });

  it('非法轮询秒数报字段名', () => {
    const p = tempConfig(`
server: { port: 7890, auth: { enabled: false, token: "x" } }
poll: { intervalMs: "abc" }
`);
    process.env.CONFIG_PATH = p;
    expect(() => loadConfig()).toThrow(/poll\.intervalMs/);
  });
});

function requireCacheFor(_p: string): void { /* ESM 无缓存可清，CONFIG_PATH 每次读盘 */ }
