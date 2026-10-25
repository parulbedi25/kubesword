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
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/ws/logs') return handleLogs(ws, url, manager);
    if (url.pathname === '/ws/exec') return handleExec(ws, url, manager);
    ws.close(1008, 'unknown endpoint');
  });
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
    ws.send(`\n[error] unknown cluster: ${cluster}\n`);
    return ws.close();
  }

  if (conn.isDemo) {
    // Stream demo logs line by line, then keep appending heartbeat lines
    const lines = mock.DEMO_LOGS.split('\n');
    let i = 0;
    const timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return clearInterval(timer);
      if (i < lines.length) {
        ws.send(lines[i] + '\n');
        i++;
      } else {
        ws.send(`[${new Date().toISOString()}] INFO  GET /healthz 200 ${1 + Math.floor(Math.random() * 5)}ms\n`);
      }
    }, 120);
    ws.on('close', () => clearInterval(timer));
    return;
  }

  const stream = new PassThrough();
  stream.on('data', (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk.toString());
  });

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
    if (ws.readyState === ws.OPEN) {
      ws.send(`\n[error] ${e?.body?.message || e.message}\n`);
      ws.close();
    }
  }
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
    ws.send(`\r\n[error] unknown cluster: ${cluster}\r\n`);
    return ws.close();
  }

  if (conn.isDemo) {
    ws.send(`\x1b[1;32m➜\x1b[0m  Connected to \x1b[1m${pod}\x1b[0m (demo shell — read-only simulation)\r\n`);
    ws.send(`\x1b[90mType 'help' for demo commands.\x1b[0m\r\n$ `);
    let buf = '';
    ws.on('message', (data) => {
      const s = data.toString();
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          ws.send('\r\n');
          handleDemoCommand(ws, buf.trim(), { pod, namespace });
          buf = '';
          if (ws.readyState === ws.OPEN) ws.send('$ ');
        } else if (ch === '\u007f') {
          if (buf.length) { buf = buf.slice(0, -1); ws.send('\b \b'); }
        } else if (ch === '\u0003') {
          ws.send('^C\r\n$ '); buf = '';
        } else {
          buf += ch; ws.send(ch);
        }
      }
    });
    return;
  }

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();

  stdout.on('data', (d) => ws.readyState === ws.OPEN && ws.send(d));
  stderr.on('data', (d) => ws.readyState === ws.OPEN && ws.send(d));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        // node client resizes via separate call; best-effort ignore
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        stdin.write(msg.data);
        return;
      }
    } catch { /* raw input */ }
    stdin.write(data);
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
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[error] exec failed: ${e?.body?.message || e.message}\r\n`);
      ws.close();
    }
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
