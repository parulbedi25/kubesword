#!/usr/bin/env node
'use strict';

/**
 * `npm start` — the simplest way to run KubeSword locally:
 *   1. builds the web app first if needed (one-time, cached afterwards)
 *   2. starts the server
 *   3. opens your default web browser
 *
 * Env knobs:
 *   PORT=3001        server port (default 3001)
 *   NO_BROWSER=1     don't auto-open the browser
 *
 * Flags:
 *   --build          force a rebuild
 *   --no-open        don't auto-open the browser
 */

const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const CLIENT_INDEX = path.join(ROOT, 'client', 'dist', 'index.html');
const SERVER_BUNDLE = path.join(ROOT, 'server', 'dist', 'index.js');

function needsBuild() {
  return (
    process.argv.includes('--build') ||
    !fs.existsSync(CLIENT_INDEX) ||
    !fs.existsSync(SERVER_BUNDLE)
  );
}

function waitForHealth(url, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const req = http.get(`${url}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
      function retry() {
        if (Date.now() - start > timeoutMs) return reject(new Error('server did not become ready in time'));
        setTimeout(poll, 400);
      }
    })();
  });
}

function openBrowser(url) {
  const plat = process.platform;
  const cmd = plat === 'darwin' ? `open "${url}"` : plat === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`[kubesword] could not auto-open a browser — visit ${url} manually`);
  });
}

async function main() {
  if (needsBuild()) {
    console.log('[kubesword] first run — building the web app (this takes a minute, only once)…');
    try {
      execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.error('\n[kubesword] build failed. Make sure dependencies are installed (`npm install`) and try again.');
      process.exit(1);
    }
  }

  const child = spawn(process.execPath, [SERVER_BUNDLE], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error('[kubesword] failed to start server:', err.message);
    process.exit(1);
  });
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  const url = `http://localhost:${PORT}`;
  try {
    await waitForHealth(url);
  } catch (err) {
    console.error(`[kubesword] ${err.message} — check the logs above.`);
    child.kill();
    process.exit(1);
  }

  console.log(`\n  ⚔️  KubeSword is running at ${url}\n`);

  const noOpen = process.env.NO_BROWSER || process.env.BROWSER === 'none' || process.argv.includes('--no-open');
  if (!noOpen) openBrowser(url);
}

main();
