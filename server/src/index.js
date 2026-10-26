'use strict';

/**
 * KubeSword server — Express + WebSocket bridge to Kubernetes.
 *
 * Modes:
 *  - dev (`npm start`): serves /api/* + /ws/* only; the Vite dev server
 *    serves the UI and proxies API/WS here.
 *  - web/desktop (`npm run web`, packaged apps, Docker): also serves the
 *    built UI from client/dist with SPA fallback.
 *
 * The server is a stateless bridge: request/stream errors are contained and
 * logged, never fatal. It only exits on SIGINT/SIGTERM or listen failure.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const { K8sManager } = require('./k8s-manager');
const { createApiRouter } = require('./routes');
const { createPortForwardRouter } = require('./portforward');
const { attachWebSockets } = require('./websocket');

const PORT = Number(process.env.PORT || process.env.KUBESWORD_PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

function createApp(manager) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));
  app.use(express.text({ type: ['text/yaml', 'text/plain'], limit: '4mb' }));

  // Basic abuse protection (generous for a local tool).
  app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', current: manager.currentContext, time: new Date().toISOString() });
  });
  app.use('/api', createApiRouter(manager));
  app.use('/api', createPortForwardRouter(manager));

  const staticDir = findWebUi();
  if (staticDir) {
    console.log(`[kubesword] serving web UI from ${staticDir}`);
    app.use(express.static(staticDir));
    // SPA fallback — everything that isn't API/WS serves index.html.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    app.get('/', (req, res) =>
      res.json({ name: 'kubesword-server', api: '/api/health', ui: 'run the client dev server (vite) or build the client' }),
    );
  }

  // Central error handler: k8s client errors carry .body.message + statusCode.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.statusCode || err?.response?.statusCode || 500;
    const message = err?.body?.message || err?.message || 'internal error';
    if (status >= 500) console.error('[kubesword] api error:', message);
    res.status(status).json({ error: message });
  });

  return app;
}

// The built UI lives in different places per distribution:
//   repo dev / Docker  -> <repo>/client/dist
//   esbuild bundle     -> server/dist/index.js, UI alongside at server/../client/dist
//   Electron package   -> resources/client/dist
//   custom             -> KUBESWORD_UI_DIR (checked first)
function findWebUi() {
  const candidates = [
    process.env.KUBESWORD_UI_DIR,
    path.join(__dirname, '../../client/dist'),
    path.join(__dirname, '../client/dist'),
    typeof process.resourcesPath === 'string' && path.join(process.resourcesPath, 'client/dist'),
    path.join(__dirname, 'public'),
  ].filter(Boolean);
  return candidates.find((d) => {
    try {
      return fs.existsSync(path.join(d, 'index.html'));
    } catch {
      return false;
    }
  });
}

function main() {
  const manager = new K8sManager();
  const app = createApp(manager);
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server });
  attachWebSockets(wss, manager);

  // Malformed HTTP (garbage bytes, half-open sockets) kills the socket,
  // never the process.
  server.on('clientError', (err, socket) => {
    console.error('[kubesword] client error:', err?.message || err);
    try {
      socket.destroy();
    } catch { /* noop */ }
  });

  // Last-resort guards: the k8s client does network I/O on stray sockets
  // and watch streams that can reject outside any request. Log loudly and
  // stay up — this server is a stateless bridge.
  process.on('unhandledRejection', (reason) => {
    console.error('[kubesword] unhandled rejection (server staying up):', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[kubesword] uncaught exception (server staying up):', err);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[kubesword] server listening on http://${HOST}:${PORT}`);
    if (process.send) process.send({ type: 'kubesword:ready', port: PORT });
  });

  const shutdown = (sig) => {
    console.log(`[kubesword] ${sig} received, shutting down…`);
    try {
      wss.close();
    } catch { /* noop */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server, manager };
}

if (require.main === module) main();

module.exports = { createApp, findWebUi, main };
