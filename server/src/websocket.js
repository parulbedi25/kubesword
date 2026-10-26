'use strict';

/**
 * WebSocket endpoints:
 *   /ws/logs?cluster=&namespace=&pod=&container=&tailLines=
 *   /ws/exec?cluster=&namespace=&pod=&container=&command=
 *
 * Message protocol (JSON, one object per message):
 *   server -> client: { type: 'stdout'|'stderr', data }   chunk of output
 *                     { type: 'error', data }              fatal error, socket closes after
 *                     { type: 'exit', code }               stream/process ended
 *   client -> server: { type: 'stdin', data }  (exec only)
 *                     { type: 'resize', cols, rows }       (exec only, best-effort)
 *
 * Every socket error is contained: a bad client can never crash the server.
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
    // Handlers are async: an uncaught rejection would be an unhandled
    // rejection and kill the whole server (taking the UI down with it in
    // `npm start` / desktop mode). Always catch and report over the socket.
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

// ---------------------------------------------------------------------------
// Socket helpers (never throw)
// ---------------------------------------------------------------------------

function safeSend(ws, obj) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  } catch { /* peer went away mid-write */ }
}

function safeClose(ws, code, reason) {
  try {
    ws.close(code, reason);
  } catch { /* already closed */ }
}

function sendErrorAndClose(ws, message) {
  safeSend(ws, { type: 'error', data: String(message || 'unknown error') });
  safeClose(ws);
}

function failWs(ws, err) {
  console.error('[kubesword] websocket handler error:', err?.message || err);
  sendErrorAndClose(ws, err?.body?.message || err?.message || 'internal error');
}

function params(url) {
  const q = url.searchParams;
  return {
    cluster: q.get('cluster') || '',
    namespace: q.get('namespace') || '',
    pod: q.get('pod') || '',
    container: q.get('container') || undefined,
    tailLines: Math.min(5000, Math.max(1, Number(q.get('tailLines') || 500) || 500)),
    command: q.get('command') || '/bin/sh',
  };
}

function resolveConn(ws, manager, cluster) {
  try {
    return manager.get(cluster);
  } catch {
    sendErrorAndClose(ws, `unknown cluster: ${cluster || '(none)'}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// /ws/logs
// ---------------------------------------------------------------------------

async function handleLogs(ws, url, manager) {
  const { cluster, namespace, pod, container, tailLines } = params(url);
  if (!namespace || !pod) return sendErrorAndClose(ws, 'namespace and pod are required');
  const conn = resolveConn(ws, manager, cluster);
  if (!conn) return;

  if (conn.isDemo) return streamDemoLogs(ws);

  const stream = new PassThrough();
  stream.on('error', () => {});
  stream.on('data', (chunk) => safeSend(ws, { type: 'stdout', data: chunk.toString() }));

  let closed = false;
  ws.on('close', () => {
    closed = true;
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
    if (!closed) sendErrorAndClose(ws, e?.body?.message || e?.message || 'log stream failed');
    return;
  }
  try { stream.destroy(); } catch { /* noop */ }
  if (!closed) {
    safeSend(ws, { type: 'exit', code: 0 });
    safeClose(ws);
  }
}

function streamDemoLogs(ws) {
  const lines = mock.DEMO_LOGS.split('\n').filter(Boolean);
  let i = 0;
  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return clearInterval(timer);
    try {
      if (i < lines.length) {
        safeSend(ws, { type: 'stdout', data: lines[i] + '\n' });
        i++;
      } else {
        safeSend(ws, {
          type: 'stdout',
          data: `[${new Date().toISOString()}] INFO  GET /healthz 200 ${1 + Math.floor(Math.random() * 5)}ms\n`,
        });
      }
    } catch {
      clearInterval(timer);
    }
  }, 120);
  timer.unref?.();
  ws.on('close', () => clearInterval(timer));
}

// ---------------------------------------------------------------------------
// /ws/exec
// ---------------------------------------------------------------------------

async function handleExec(ws, url, manager) {
  const { cluster, namespace, pod, container, command } = params(url);
  if (!namespace || !pod) return sendErrorAndClose(ws, 'namespace and pod are required');
  const conn = resolveConn(ws, manager, cluster);
  if (!conn) return;

  if (conn.isDemo) return runDemoShell(ws, { pod, namespace });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  for (const s of [stdout, stderr, stdin]) s.on('error', () => {});

  stdout.on('data', (d) => safeSend(ws, { type: 'stdout', data: d.toString() }));
  stderr.on('data', (d) => safeSend(ws, { type: 'stderr', data: d.toString() }));

  let closed = false;
  const cleanup = () => {
    closed = true;
    for (const s of [stdout, stderr, stdin]) {
      try { s.destroy(); } catch { /* noop */ }
    }
  };
  ws.on('close', cleanup);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg && msg.type === 'stdin' && typeof msg.data === 'string') {
        if (!stdin.destroyed) stdin.write(msg.data.slice(0, 65536));
        return;
      }
      if (msg && msg.type === 'resize') return; // node client has no resize channel; ignore
      if (msg && msg.type === 'input' && typeof msg.data === 'string') {
        // Backward compat with older clients.
        if (!stdin.destroyed) stdin.write(msg.data.slice(0, 65536));
        return;
      }
    } catch {
      // Raw bytes — treat as terminal input.
      try {
        if (!stdin.destroyed) stdin.write(data);
      } catch { /* stream gone */ }
    }
  });

  const onExit = (code) => {
    if (closed) return;
    safeSend(ws, { type: 'exit', code: code ?? 0 });
    safeClose(ws);
  };

  const cmds = command.includes(' ') ? ['sh', '-c', command] : [command];
  const candidates = [cmds, ['/bin/sh'], ['/bin/bash'], ['sh']];
  let lastErr = null;
  for (const c of candidates) {
    if (closed) return;
    if (JSON.stringify(c) === JSON.stringify(cmds) && c !== cmds) continue;
    try {
      await conn.exec.exec(namespace, pod, container, c, stdout, stderr, stdin, true, (status) => {
        const code = typeof status?.code === 'number' ? status.code : status?.status === 'Success' ? 0 : 1;
        onExit(code);
      });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!closed) sendErrorAndClose(ws, `exec failed: ${lastErr?.body?.message || lastErr?.message || 'no shell available in container'}`);
  cleanup();
}

// ---------------------------------------------------------------------------
// Demo shell (read-only simulation so terminal UI is explorable offline)
// ---------------------------------------------------------------------------

function runDemoShell(ws, ctx) {
  safeSend(ws, { type: 'stdout', data: '\x1b[1;32m➜\x1b[0m  Connected to \x1b[1m' + ctx.pod + '\x1b[0m (demo shell — read-only simulation)\r\n' });
  safeSend(ws, { type: 'stdout', data: "\x1b[90mType 'help' for demo commands.\x1b[0m\r\n$ " });
  let buf = '';
  const out = (s) => safeSend(ws, { type: 'stdout', data: s });
  ws.on('message', (data) => {
    try {
      let s;
      try {
        const msg = JSON.parse(data.toString());
        s = typeof msg.data === 'string' ? msg.data : '';
      } catch {
        s = data.toString();
      }
      for (const ch of s.slice(0, 4096)) {
        if (ch === '\r' || ch === '\n') {
          out('\r\n');
          handleDemoCommand(out, buf.trim(), ctx, ws);
          buf = '';
          if (ws.readyState === ws.OPEN) out('$ ');
        } else if (ch === '\u007f') {
          if (buf.length) { buf = buf.slice(0, -1); out('\b \b'); }
        } else if (ch === '\u0003') {
          out('^C\r\n$ ');
          buf = '';
        } else if (ch >= ' ') {
          buf += ch;
          out(ch);
        }
        if (buf.length > 4096) buf = buf.slice(-4096);
      }
    } catch { /* malformed input — ignore */ }
  });
}

function handleDemoCommand(out, cmd, ctx, ws) {
  if (!cmd) return;
  const [base, ...args] = cmd.split(/\s+/);
  switch (base) {
    case 'help':
      out("Available: ls, env, cat /etc/hostname, ps, whoami, date, echo, clear, exit\r\n");
      break;
    case 'ls':
      out('bin  etc  usr  app  config  logs  tmp\r\n');
      break;
    case 'whoami':
      out('appuser\r\n');
      break;
    case 'date':
      out(new Date().toString() + '\r\n');
      break;
    case 'env':
      out(`POD_NAME=${ctx.pod}\r\nPOD_NAMESPACE=${ctx.namespace}\r\nLOG_LEVEL=info\r\nREGION=ap-south-1\r\n`);
      break;
    case 'ps':
      out('  PID TTY  CMD\r\n    1 ?    /app/checkout-api --port 8080\r\n   18 ?    /app/sidecar --metrics :9090\r\n');
      break;
    case 'echo':
      out(args.join(' ') + '\r\n');
      break;
    case 'clear':
      out('\x1b[2J\x1b[H');
      break;
    case 'exit':
      out('logout\r\n');
      safeClose(ws);
      break;
    default:
      if (base === 'cat' && args[0] === '/etc/hostname') {
        out(ctx.pod + '\r\n');
        break;
      }
      out(`sh: ${base}: command not found (demo shell)\r\n`);
  }
}

module.exports = { attachWebSockets };
