#!/usr/bin/env node
'use strict';

/**
 * `npm start` — run KubeSword locally with NO build step:
 *   1. starts the API server straight from source (server/src)
 *   2. starts the UI in dev mode (Vite serves it directly, no `dist` build)
 *   3. opens your default web browser
 *
 * Env knobs:
 *   PORT=3001          API server port (default 3001)
 *   CLIENT_PORT=5173   UI (Vite) port (default 5173)
 *   NO_BROWSER=1       don't auto-open the browser
 *
 * Flags:
 *   --no-open          don't auto-open the browser
 *
 * (Production builds still exist for packaging: `npm run web` / `npm run dist*`.)
 */

const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const API_PORT = Number(process.env.PORT || 3001);
const UI_PORT = Number(process.env.CLIENT_PORT || 5173);
const UI_URL = `http://localhost:${UI_PORT}`;
const MIN_NODE = 18;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function tag(prefix, color) {
  return (chunk, out) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim() === '') continue;
      out.write(`${color}[${prefix}]\x1b[0m ${line}\n`);
    }
  };
}

function spawnTagged(name, color, cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = tag(name, color);
  child.stdout.on('data', (d) => write(d, process.stdout));
  child.stderr.on('data', (d) => write(d, process.stderr));
  return child;
}

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

async function waitFor(url, label, timeoutMs = 120000, shouldAbort) {
  const start = Date.now();
  for (;;) {
    if (shouldAbort && shouldAbort()) throw new Error(`${label} failed to start — check the logs above`);
    const r = await httpGet(url, 2000);
    if (r && r.status < 500) return;
    if (Date.now() - start > timeoutMs) throw new Error(`${label} did not become ready at ${url}`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
}

function openBrowser(url) {
  const plat = process.platform;
  const cmd = plat === 'darwin' ? `open "${url}"` : plat === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`[kubesword] could not auto-open a browser — visit ${url} manually`);
  });
}

function fail(msg) {
  console.error(`[kubesword] ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Preflights — fail fast with an actionable message instead of a cryptic crash
// ---------------------------------------------------------------------------

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < MIN_NODE) {
    fail(
      `Node.js ${process.versions.node} is too old — KubeSword needs Node.js ${MIN_NODE} or newer.\n` +
        `  Install it from https://nodejs.org (LTS), then run \`npm install\` and \`npm start\` again.`,
    );
  }
}

function checkDeps() {
  const missing = [];
  try {
    require.resolve('express', { paths: [path.join(ROOT, 'server')] });
  } catch {
    missing.push('server');
  }
  try {
    require.resolve('vite', { paths: [path.join(ROOT, 'client')] });
  } catch {
    missing.push('client');
  }
  if (missing.length) {
    fail(
      `dependencies are not installed (${missing.join(', ')}).\n  Run \`npm install\` first, then \`npm start\`.`,
    );
  }
}

// Is something KubeSword-shaped already serving the API here? If yes, reuse
// it instead of spawning a second server (avoids EADDRINUSE confusion when
// a previous `npm start` is still running in another terminal).
async function findReusableApi() {
  const r = await httpGet(`http://localhost:${API_PORT}/api/health`);
  if (!r) return false;
  try {
    const body = JSON.parse(r.body);
    return body && body.status === 'ok' && typeof body.current === 'string';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  checkNode();
  checkDeps();

  if (!Number.isInteger(API_PORT) || API_PORT < 1 || API_PORT > 65535) fail(`invalid PORT: ${process.env.PORT}`);
  if (!Number.isInteger(UI_PORT) || UI_PORT < 1 || UI_PORT > 65535) fail(`invalid CLIENT_PORT: ${process.env.CLIENT_PORT}`);
  if (API_PORT === UI_PORT) fail('PORT and CLIENT_PORT must be different');

  // UI port busy? Something (probably another KubeSword) is already there —
  // open it instead of spawning duplicates.
  if (await portInUse(UI_PORT)) {
    console.log(`[kubesword] port ${UI_PORT} is already in use — opening it instead of starting a second copy.`);
    console.log(`\n  ⚔️  KubeSword is running at ${UI_URL}\n`);
    if (!noOpen()) openBrowser(UI_URL);
    return;
  }

  // Supervised children: a crash restarts that child (bounded) instead of
  // killing its healthy sibling and taking the whole app down.
  const children = {};
  const restarts = { server: 0, client: 0 };
  const MAX_RESTARTS = 3;
  let shuttingDown = false;
  let failed = false;

  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const c of Object.values(children)) {
      try {
        c.kill('SIGTERM');
      } catch { /* noop */ }
    }
    setTimeout(() => process.exit(code), 800).unref();
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  function onChildExit(name, label, respawn, code) {
    if (shuttingDown) return;
    if (code === 0 || code === null) return;
    if (restarts[name] < MAX_RESTARTS) {
      restarts[name] += 1;
      console.error(`[kubesword] ${label} crashed (code ${code}) — restarting (${restarts[name]}/${MAX_RESTARTS})…`);
      setTimeout(() => {
        if (!shuttingDown) respawn();
      }, 2000);
    } else {
      console.error(`[kubesword] ${label} keeps crashing — giving up. Check the logs above.`);
      failed = true;
      shutdown(code);
    }
  }

  function wireChild(name, label, child, respawn) {
    children[name] = child;
    // A child that survives 60s earns a clean slate.
    setTimeout(() => {
      restarts[name] = 0;
    }, 60000).unref();
    child.on('error', (err) => {
      console.error(`[kubesword] failed to start ${label}: ${err.message}`);
      failed = true;
      shutdown(1);
    });
    child.on('exit', (code) => onChildExit(name, label, respawn, code));
  }

  // API port busy with a healthy KubeSword server? Reuse it.
  let serverReused = false;
  if (await portInUse(API_PORT)) {
    if (await findReusableApi()) {
      console.log(`[kubesword] API server already running on port ${API_PORT} — reusing it.`);
      serverReused = true;
    } else {
      fail(
        `port ${API_PORT} is in use by something that is not KubeSword.\n` +
          `  Stop that process, or pick another port: \`PORT=3101 npm start\`.`,
      );
    }
  }

  function spawnServer() {
    console.log('[kubesword] starting API server (from source, no build)…');
    wireChild(
      'server',
      'API server',
      spawnTagged('server', '\x1b[34m', process.execPath, ['server/src/index.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(API_PORT) },
      }),
      spawnServer,
    );
  }

  function spawnUi() {
    console.log('[kubesword] starting UI in dev mode (no build)…');
    wireChild(
      'client',
      'UI',
      spawnTagged('client', '\x1b[32m', 'npm', ['run', 'dev', '-w', 'client'], {
        cwd: ROOT,
        shell: true,
        env: { ...process.env, API_PORT: String(API_PORT), CLIENT_PORT: String(UI_PORT) },
      }),
      spawnUi,
    );
  }

  if (!serverReused) spawnServer();
  spawnUi();

  const aborted = () => failed || shuttingDown;
  try {
    await waitFor(`http://localhost:${API_PORT}/api/health`, 'API server', 120000, aborted);
    await waitFor(UI_URL, 'UI', 120000, aborted);
  } catch (err) {
    console.error(`[kubesword] ${err.message} — check the logs above.`);
    shutdown(1);
    return;
  }

  console.log(`\n  ⚔️  KubeSword is running at ${UI_URL}  (API: http://localhost:${API_PORT})\n`);
  if (!noOpen()) openBrowser(UI_URL);
}

function noOpen() {
  return process.env.NO_BROWSER || process.env.BROWSER === 'none' || process.argv.includes('--no-open');
}

main().catch((e) => fail(e.message || String(e)));
