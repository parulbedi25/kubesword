'use strict';

/**
 * Simple TCP port-forward manager.
 * POST /api/:cluster/portforward { namespace, pod, podPort, localPort? }
 *   -> opens a local TCP listener that forwards into the pod via the
 *      Kubernetes portforward API, and proxies HTTP/TCP traffic.
 * GET  /api/:cluster/portforward -> active forwards
 * DELETE /api/:cluster/portforward/:id -> stop
 */

const express = require('express');
const net = require('net');
const { PassThrough } = require('stream');

const sessions = new Map(); // id -> { server, ... }
let nextId = 1;

function createPortForwardRouter(manager) {
  const router = express.Router();

  router.get('/:cluster/portforward', (req, res) => {
    const items = [...sessions.values()].filter((s) => s.cluster === req.params.cluster);
    res.json({ items });
  });

  router.post('/:cluster/portforward', async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Port-forward is disabled in the demo cluster' });
    const { namespace, pod, podPort, localPort } = req.body || {};
    if (!namespace || !pod || !podPort) {
      return res.status(400).json({ error: 'namespace, pod and podPort are required' });
    }
    const id = `pf-${nextId++}`;
    const listenPort = Number(localPort) || 0;

    const server = net.createServer((socket) => {
      const outStream = new PassThrough();
      const errStream = new PassThrough();
      const inStream = new PassThrough();
      outStream.on('data', (d) => socket.write(d));
      socket.on('data', (d) => inStream.write(d));
      socket.on('close', () => { for (const s of [outStream, errStream, inStream]) try { s.destroy(); } catch { /* noop */ } });
      conn.portForward.portForward(namespace, pod, [Number(podPort)], outStream, errStream, inStream, false)
        .catch((e) => {
          socket.write(`\n[port-forward error] ${e?.body?.message || e.message}\n`);
          socket.end();
        });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, '127.0.0.1', resolve);
    });

    const info = {
      id,
      cluster: req.params.cluster,
      namespace,
      pod,
      podPort: Number(podPort),
      localPort: server.address().port,
      startedAt: new Date().toISOString(),
    };
    sessions.set(id, { ...info, server });
    res.json({ item: info });
  });

  router.delete('/:cluster/portforward/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    try { s.server.close(); } catch { /* noop */ }
    sessions.delete(req.params.id);
    res.json({ stopped: req.params.id });
  });

  return router;
}

module.exports = { createPortForwardRouter };
