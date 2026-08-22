#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');

const TAG = '[dsh-ssh-mcp]';
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGQUIT: 131, SIGTERM: 143, SIGBREAK: 21 };
const ORPHAN_TTL_MS = 60 * 60 * 1000;
const RESOLVED_FALLBACK_MS = 10 * 1000;

function log(msg) {
  console.error(`${TAG} ${msg}`);
}

function die(msg) {
  console.error(`${TAG} error: ${msg}`);
  process.exit(1);
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function readJson(file) {
  try {
    return JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    die(`invalid JSON in ${file}: ${err.message}`);
  }
}

function resolveProjectRoot() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--project');
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  if (process.env.DSH_SSH_PROJECT) return path.resolve(process.env.DSH_SSH_PROJECT);
  return process.cwd();
}

// v0.2: credentials live in one-field-per-file flat files inside .secrets/.
// A single accidental read exposes at most one field, never the full set.
function readSecret(secretsDir, name) {
  const file = path.join(secretsDir, name);
  if (!fs.existsSync(file)) return undefined;
  const val = stripBom(fs.readFileSync(file, 'utf8')).replace(/[\r\n]+$/, '');
  return val.length ? val : undefined;
}

function loadConfig(secretsDir) {
  const host = readSecret(secretsDir, 'ssh_host');
  const username = readSecret(secretsDir, 'ssh_user');
  const password = readSecret(secretsDir, 'ssh_password');
  const keyPath = readSecret(secretsDir, 'ssh_key_path');
  const port = parseInt(readSecret(secretsDir, 'ssh_port') || '22', 10);

  if (!host) die(`missing ${path.join(secretsDir, 'ssh_host')} (see mcps/ssh-runner/secrets-template/)`);
  if (!username) die(`missing ${path.join(secretsDir, 'ssh_user')}`);
  if (!password && !keyPath) die(`need ${path.join(secretsDir, 'ssh_password')} or ssh_key_path (key auth preferred)`);
  if (Number.isNaN(port) || port <= 0) die(`invalid ssh_port value: ${port}`);

  const config = { name: 'default', host, port, username };
  if (keyPath) config.privateKey = keyPath;
  else config.password = password;
  return config;
}

function loadPolicy() {
  const policyFile = path.join(__dirname, '..', 'policy.json');
  if (!fs.existsSync(policyFile)) return {};
  const policy = readJson(policyFile);
  const allowed = ['blacklist', 'whitelist', 'allowedRemotePaths', 'allowedLocalPaths'];
  for (const key of Object.keys(policy)) {
    if (!allowed.includes(key)) die(`unsupported key "${key}" in policy.json (allowed: ${allowed.join(', ')})`);
    if (!Array.isArray(policy[key])) die(`policy.json "${key}" must be an array`);
  }
  return policy;
}

function applyPolicy(config, policy) {
  const fieldMap = {
    blacklist: 'commandBlacklist',
    whitelist: 'commandWhitelist',
    allowedRemotePaths: 'allowedRemotePaths',
    allowedLocalPaths: 'allowedLocalPaths',
  };
  for (const [policyKey, field] of Object.entries(fieldMap)) {
    if (policy[policyKey]) config[field] = policy[policyKey];
  }
}

function cleanupOrphans(secretsDir) {
  try {
    const cutoff = Date.now() - ORPHAN_TTL_MS;
    for (const f of fs.readdirSync(secretsDir)) {
      if (!f.startsWith('.resolved-') || !f.endsWith('.json')) continue;
      const p = path.join(secretsDir, f);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {}
    }
  } catch {}
}

function writeResolvedConfig(secretsDir, config) {
  const file = path.join(secretsDir, `.resolved-${process.pid}-${randomBytes(4).toString('hex')}.json`);
  fs.writeFileSync(file, JSON.stringify({ default: config }, null, 2), { mode: 0o600 });
  return file;
}

function resolveServerCli() {
  let pkgFile;
  try {
    pkgFile = require.resolve('@fangjunjie/ssh-mcp-server/package.json');
  } catch {
    die('dependency @fangjunjie/ssh-mcp-server not installed — run npm install in the ssh-runner directory');
  }
  const cli = path.join(path.dirname(pkgFile), 'build', 'index.js');
  if (!fs.existsSync(cli)) die(`server entry missing: ${cli}`);
  return cli;
}

function printHelp() {
  console.log(`dsh-ssh-mcp — cross-client SSH MCP runner

Usage: node run-ssh-mcp.cjs [--project <path>]

  --project <path>   Project root containing .secrets/ credential files.
                     Fallback: DSH_SSH_PROJECT env var, then process.cwd().
  --help             Show this help.

Credential files (one field per file, created by install.ps1):
  .secrets/ssh_host          SSH hostname or IP
  .secrets/ssh_port          optional, default 22
  .secrets/ssh_user          login user
  .secrets/ssh_password      password auth (or use ssh_key_path instead)
  .secrets/ssh_key_path      path to private key file (preferred)

Behavior:
  1. Reads the flat credential files (never logged, never passed via argv)
  2. Merges policy.json (blacklist/whitelist/path allowlists)
  3. Writes a transient resolved config inside .secrets/, deleted as soon as
     the server logs its first "connection established" (10s fallback timer)
  4. Spawns @fangjunjie/ssh-mcp-server with --config-file: credentials never
     appear in argv, process listings, or client config files`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const projectRoot = resolveProjectRoot();
  if (!fs.existsSync(projectRoot)) die(`project root not found: ${projectRoot}`);
  const secretsDir = path.join(projectRoot, '.secrets');

  const config = loadConfig(secretsDir);
  applyPolicy(config, loadPolicy());
  cleanupOrphans(secretsDir);
  const resolvedFile = writeResolvedConfig(secretsDir, config);
  const serverCli = resolveServerCli();

  log(`project: ${projectRoot}`);
  log(`server:  ${config.host}:${config.port} as ${config.username} (${config.privateKey ? 'key' : 'password'} auth)`);

  const child = spawn(process.execPath, [serverCli, '--config-file', resolvedFile], {
    stdio: ['inherit', 'inherit', 'pipe'],
  });

  let exited = false;
  let resolvedDeleted = false;
  const deleteResolved = () => {
    if (resolvedDeleted) return;
    resolvedDeleted = true;
    try {
      fs.unlinkSync(resolvedFile);
    } catch {}
  };
  const exitRunner = (code) => {
    if (exited) return;
    exited = true;
    deleteResolved();
    process.exit(code);
  };

  // The server parses --config-file synchronously at startup, then keeps
  // everything in memory. Once it logs its first readiness line we can drop
  // the resolved file; a fallback timer covers silenced-logging edge cases.
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    if (!resolvedDeleted && /connection established/i.test(chunk)) deleteResolved();
  });
  setTimeout(deleteResolved, RESOLVED_FALLBACK_MS).unref();

  child.on('error', (err) => {
    log(`failed to start server: ${err.message}`);
    exitRunner(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) exitRunner(SIGNAL_EXIT_CODES[signal] || 143);
    exitRunner(code === null ? 1 : code);
  });

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(sig, () => {
        if (!child.killed) child.kill(sig);
      });
    } catch {}
  }
}

main();
