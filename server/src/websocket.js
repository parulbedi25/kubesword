'use strict';

/**
 * WebSocket endpoints:
 *  - /ws/logs?cluster=&namespace=&pod=&container=&tailLines=
 *  - /ws/exec?cluster=&namespace=&pod=&container=&command=/bin/sh (or shell)
 */

const { PassThrough } = require('stream');
const mock = require('./mock-data');

function attachWebSockets(wss, manager) {
  wss.on('connection', (ws, req) => {
    // Socket errors must never take down the process.
    ws.on('error', () => {});
    let url;
    try {
      url = new URL(req?.url || '', 'http://localhost');
    } catch {
      return safeClose(ws, 1008, 'bad request');
    }
    // Handlers are async: a rejection here would be an unhandled rejection
    // and crash the whole server (killing the UI with it in `npm start`).
    if (url.pathname === '/ws/logs') {
      Promise.resolve(handleLogs(ws, url, manager)).catch((err) => failWs(ws, err));
      return;
    }
    if (url.pathname === '/ws/exec') {
      Promise.resolve(handleExec(ws, url, manager)).catch((err) => failWs(ws, err));
      return;
    }
    safeClose(ws, 1008, 'unknown endpoint');
  });
  wss.on('error', (err) => console.error('[kubesword] websocket server error:', err?.message || err));
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(data);
  } catch { /* peer went away mid-write */ }
}

function safeClose(ws, code, reason) {
  try {
    ws.close(code, reason);
  } catch { /* already closed */ }
}

function failWs(ws, err) {
  console.error('[kubesword] websocket handler error:', err?.message || err);
  safeSend(ws, `\n[error] ${err?.message || 'internal error'}\n`);
  safeClose(ws, 1011, 'internal error');
}

async function handleLogs(ws, url, manager) {
  const cluster = url.searchParams.get('cluster');
  const namespace = url.searchParams.get('namespace');
  const pod = url.searchParams.get('pod');
  const container = url.searchParams.get('container') || undefined;
  const tailLines = Number(url.searchParams.get('tailLines') || 500);

  let conn;
  try {
    conn = manager.get(cluster);
  } catch {
    safeSend(ws, `\n[error] unknown cluster: ${cluster}\n`);
    return safeClose(ws);
  }

  if (conn.isDemo) {
    // Stream demo logs line by line, then keep appending heartbeat lines
    const lines = mock.DEMO_LOGS.split('\n');
    let i = 0;
    const timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return clearInterval(timer);
      try {
        if (i < lines.length) {
          ws.send(lines[i] + '\n');
          i++;
        } else {
          ws.send(`[${new Date().toISOString()}] INFO  GET /healthz 200 ${1 + Math.floor(Math.random() * 5)}ms\n`);
        }
      } catch {
        clearInterval(timer);
      }
    }, 120);
    timer.unref?.();
    ws.on('close', () => clearInterval(timer));
    return;
  }

  const stream = new PassThrough();
  stream.on('error', () => {});
  stream.on('data', (chunk) => safeSend(ws, chunk.toString()));

  ws.on('close', () => {
    try { stream.destroy(); } catch { /* noop */ }
  });

  try {
    await conn.log.log(namespace, pod, container, stream, {
      follow: true,
      tailLines,
      timestamps: true,
      pretty: false,
    });
  } catch (e) {
    safeSend(ws, `\n[error] ${e?.body?.message || e.message}\n`);
    safeClose(ws);
  }
  try { stream.destroy(); } catch { /* noop */ }
}

async function handleExec(ws, url, manager) {
  const cluster = url.searchParams.get('cluster');
  const namespace = url.searchParams.get('namespace');
  const pod = url.searchParams.get('pod');
  const container = url.searchParams.get('container') || undefined;
  const command = url.searchParams.get('command') || '/bin/sh';
  const cols = Number(url.searchParams.get('cols') || 120);
  const rows = Number(url.searchParams.get('rows') || 32);

  let conn;
  try {
    conn = manager.get(cluster);
  } catch {
    safeSend(ws, `\r\n[error] unknown cluster: ${cluster}\r\n`);
    return safeClose(ws);
  }

  if (conn.isDemo) {
    safeSend(ws, `\x1b[1;32m➜\x1b[0m  Connected to \x1b[1m${pod}\x1b[0m (demo shell — read-only simulation)\r\n`);
    safeSend(ws, `\x1b[90mType 'help' for demo commands.\x1b[0m\r\n$ `);
    let buf = '';
    ws.on('message', (data) => {
      try {
        const s = data.toString().slice(0, 4096);
        for (const ch of s) {
          if (ch === '\r' || ch === '\n') {
            safeSend(ws, '\r\n');
            handleDemoCommand(ws, buf.trim(), { pod, namespace });
            buf = '';
            safeSend(ws, '$ ');
          } else if (ch === '\u007f') {
            if (buf.length) { buf = buf.slice(0, -1); safeSend(ws, '\b \b'); }
          } else if (ch === '\u0003') {
            safeSend(ws, '^C\r\n$ '); buf = '';
          } else {
            buf += ch; safeSend(ws, ch);
          }
          if (buf.length > 4096) buf = buf.slice(-4096);
        }
      } catch { /* malformed input — ignore */ }
    });
    return;
  }

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  for (const s of [stdout, stderr, stdin]) s.on('error', () => {});

  stdout.on('data', (d) => safeSend(ws, d));
  stderr.on('data', (d) => safeSend(ws, d));

  const writeStdin = (chunk) => {
    try {
      if (!stdin.destroyed) stdin.write(chunk);
    } catch { /* stream gone — ignore */ }
  };

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        // node client resizes via separate call; best-effort ignore
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        writeStdin(msg.data);
        return;
      }
    } catch { /* raw input */ }
    writeStdin(data);
  });

  ws.on('close', () => {
    for (const s of [stdout, stderr, stdin]) { try { s.destroy(); } catch { /* noop */ } }
  });

  const cmds = command.includes(' ') ? ['sh', '-c', command] : [command];
  try {
    await conn.exec.exec(namespace, pod, container, cmds, stdout, stderr, stdin, true, () => {
      if (ws.readyState === ws.OPEN) ws.close();
    });
  } catch (e) {
    // Fallback: try sh then bash
    for (const alt of ['/bin/sh', '/bin/bash', 'sh']) {
      if (alt === command) continue;
      try {
        await conn.exec.exec(namespace, pod, container, [alt], stdout, stderr, stdin, true, () => {
          if (ws.readyState === ws.OPEN) ws.close();
        });
        return;
      } catch { /* try next */ }
    }
    safeSend(ws, `\r\n[error] exec failed: ${e?.body?.message || e.message}\r\n`);
    safeClose(ws);
  }
  void cols; void rows;
}

function handleDemoCommand(ws, cmd, ctx) {
  if (!cmd) return;
  const [base, ...args] = cmd.split(/\s+/);
  switch (base) {
    case 'help':
      ws.send('Available: ls, env, cat /etc/hostname, ps, whoami, date, echo, clear, exit\r\n');
      break;
    case 'ls':
      ws.send('bin  etc  usr  app  config  logs  tmp\r\n');
      break;
    case 'whoami':
      ws.send('appuser\r\n');
      break;
    case 'date':
      ws.send(new Date().toString() + '\r\n');
      break;
    case 'env':
      ws.send(`POD_NAME=${ctx.pod}\r\nPOD_NAMESPACE=${ctx.namespace}\r\nLOG_LEVEL=info\r\nREGION=ap-south-1\r\n`);
      break;
    case 'ps':
      ws.send('  PID TTY  CMD\r\n    1 ?    /app/checkout-api --port 8080\r\n   18 ?    /app/sidecar --metrics :9090\r\n');
      break;
    case 'echo':
      ws.send(args.join(' ') + '\r\n');
      break;
    case 'clear':
      ws.send('\x1b[2J\x1b[H');
      break;
    case 'exit':
      ws.send('logout\r\n');
      ws.close();
      break;
    default:
      if (base === 'cat' && args[0] === '/etc/hostname') { ws.send(ctx.pod + '\r\n'); break; }
      ws.send(`sh: ${base}: command not found (demo shell)\r\n`);
  }
}

module.exports = { attachWebSockets };
