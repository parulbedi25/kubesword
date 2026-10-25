'use strict';

/**
 * KubeSword server — Express + WebSocket bridge to Kubernetes.
 * Serves the built web UI (client/dist) in production/web/electron mode,
 * and exposes /api/* + /ws/* for the frontend.
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

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.text({ type: ['text/yaml', 'text/plain'], limit: '4mb' }));

// Basic abuse protection (generous for a local tool)
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

const manager = new K8sManager();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', current: manager.currentContext, time: new Date().toISOString() });
});
app.use('/api', createApiRouter(manager));
app.use('/api', createPortForwardRouter(manager));

// Serve built frontend if present (web / desktop production mode)
const candidates = [
  path.join(__dirname, '../../client/dist'),
  path.join(__dirname, '../client/dist'),
  path.join(process.resourcesPath || '', 'client/dist'),
  path.join(__dirname, 'public'),
];
const staticDir = candidates.find((d) => { try { return fs.existsSync(path.join(d, 'index.html')); } catch { return false; } });
if (staticDir) {
  console.log(`[kubesword] serving web UI from ${staticDir}`);
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.json({ name: 'kubesword-server', api: '/api/health', ui: 'run the client dev server (vite) or build the client' }));
}

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || err?.response?.statusCode || 500;
  const message = err?.body?.message || err.message || 'internal error';
  if (status >= 500) console.error('[kubesword] api error:', message);
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: undefined });
attachWebSockets(wss, manager);

server.listen(PORT, HOST, () => {
  console.log(`[kubesword] server listening on http://${HOST}:${PORT}`);
  if (process.send) process.send({ type: 'kubesword:ready', port: PORT });
});

module.exports = { app, server, manager };
