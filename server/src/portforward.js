'use strict';

/**
 * TCP port-forward manager.
 *   POST   /api/:cluster/portforward { namespace, pod, podPort, localPort? }
 *     opens a localhost TCP listener that forwards into the pod via the
 *     Kubernetes portforward API.
 *   GET    /api/:cluster/portforward -> active forwards for this cluster
 *   DELETE /api/:cluster/portforward/:id -> stop
 */

const express = require('express');
const net = require('net');
const { PassThrough } = require('stream');

const sessions = new Map(); // id -> { server, ...info }
let nextId = 1;

function createPortForwardRouter(manager) {
  const router = express.Router();

  router.get('/:cluster/portforward', (req, res) => {
    const items = [...sessions.values()]
      .filter((s) => s.cluster === req.params.cluster)
      .map(({ server, ...info }) => info);
    res.json({ items });
  });

  router.post('/:cluster/portforward', async (req, res, next) => {
    try {
      const conn = manager.get(req.params.cluster);
      if (conn.isDemo) return res.status(400).json({ error: 'Port-forward is disabled in the demo cluster' });

      const { namespace, pod, podPort, localPort } = req.body || {};
      if (!namespace || !pod) return res.status(400).json({ error: 'namespace and pod are required' });
      const targetPort = Number(podPort);
      if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
        return res.status(400).json({ error: 'podPort must be 1–65535' });
      }
      const listenPort = localPort == null || localPort === '' ? 0 : Number(localPort);
      if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
        return res.status(400).json({ error: 'localPort must be 1–65535 (or omitted for auto-assign)' });
      }

      const id = `pf-${nextId++}`;
      const server = net.createServer((socket) => {
        socket.on('error', () => {});
        const outStream = new PassThrough();
        const errStream = new PassThrough();
        const inStream = new PassThrough();
        for (const s of [outStream, errStream, inStream]) s.on('error', () => {});
        outStream.on('data', (d) => {
          try { socket.write(d); } catch { /* peer gone */ }
        });
        socket.on('data', (d) => {
          try {
            if (!inStream.destroyed) inStream.write(d);
          } catch { /* stream gone */ }
        });
        const done = () => {
          for (const s of [outStream, errStream, inStream]) {
            try { s.destroy(); } catch { /* noop */ }
          }
        };
        socket.on('close', done);
        socket.on('error', done);
        conn.portForward
          .portForward(namespace, pod, [targetPort], outStream, errStream, inStream, false)
          .catch((e) => {
            try {
              socket.write(`\n[port-forward error] ${e?.body?.message || e.message}\n`);
              socket.end();
            } catch { /* noop */ }
            done();
          });
      });

      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(listenPort, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
      } catch (e) {
        if (e?.code === 'EADDRINUSE') {
          return res.status(409).json({ error: `local port ${listenPort} is already in use — pick another or leave it blank for auto-assign` });
        }
        throw e;
      }
      // Later errors (client aborts etc.) must not crash the process.
      server.on('error', (e) => console.error('[kubesword] port-forward server error:', e?.message || e));

      const info = {
        id,
        cluster: req.params.cluster,
        namespace,
        pod,
        podPort: targetPort,
        localPort: server.address().port,
        startedAt: new Date().toISOString(),
      };
      sessions.set(id, { ...info, server });
      res.json({ item: info });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:cluster/portforward/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s || s.cluster !== req.params.cluster) return res.status(404).json({ error: 'not found' });
    try {
      s.server.close();
    } catch { /* noop */ }
    sessions.delete(req.params.id);
    res.json({ stopped: req.params.id });
  });

  return router;
}

module.exports = { createPortForwardRouter };
