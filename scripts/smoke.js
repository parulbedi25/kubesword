#!/usr/bin/env node
'use strict';

/**
 * `npm run smoke` — end-to-end health check for the KubeSword server.
 *
 * Boots the real API server (from source) on an ephemeral port with an
 * isolated data dir, then exercises it the way the UI does:
 *   REST: health, clusters, info, overview, every list kind, get/yaml/
 *         events-for a resource, metrics, and error paths (bad kind,
 *         bad cluster, demo write-protection).
 *   WS:   demo log stream + demo exec shell (JSON protocol), unknown-cluster
 *         rejection.
 *
 * Exit 0 = all green, 1 = something failed (with details above).
 * No cluster needed: everything runs against the built-in `demo` cluster.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

// Isolated data dir so the smoke test never touches ~/.kubesword.
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'kubesword-smoke-'));
process.env.KUBESWORD_DATA = tmpData;
process.env.PORT = '0'; // ephemeral port

const { createApp } = require('../server/src/index');
const { K8sManager } = require('../server/src/k8s-manager');
const { WebSocketServer } = require('ws');
const { attachWebSockets } = require('../server/src/websocket');
const http = require('http');

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const manager = new K8sManager();
  const app = createApp(manager);
  const server = http.createServer(app);
  attachWebSockets(new WebSocketServer({ server }), manager);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`[smoke] server up on ${base} (data dir: ${tmpData})`);

  const jget = async (p) => {
    const r = await fetch(base + p);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const jdel = async (p) => {
    const r = await fetch(base + p, { method: 'DELETE' });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ---- REST ----
    const health = await jget('/api/health');
    check('GET /api/health', health.status === 200 && health.body?.status === 'ok', JSON.stringify(health.body));

    const clusters = await jget('/api/clusters');
    const names = (clusters.body?.clusters || []).map((c) => c.name);
    check('demo cluster listed', clusters.status === 200 && names.includes('demo'), JSON.stringify(clusters.body));

    const info = await jget('/api/demo/info');
    check('GET /api/demo/info', info.status === 200 && info.body?.isDemo === true, JSON.stringify(info.body));

    const ov = await jget('/api/demo/overview');
    check(
      'GET /api/demo/overview shape',
      ov.status === 200 && ov.body?.counts && Array.isArray(ov.body?.podPhases) && Array.isArray(ov.body?.recentEvents),
      JSON.stringify(ov.body).slice(0, 200),
    );

    const kinds = ['nodes', 'namespaces', 'pods', 'deployments', 'statefulsets', 'daemonsets', 'replicasets',
      'jobs', 'cronjobs', 'services', 'ingresses', 'networkpolicies', 'endpoints', 'configmaps', 'secrets',
      'persistentvolumeclaims', 'persistentvolumes', 'storageclasses', 'roles', 'rolebindings', 'clusterroles',
      'clusterrolebindings', 'serviceaccounts', 'hpas', 'events'];
    let kindsOk = true;
    let kindsDetail = '';
    for (const k of kinds) {
      const r = await jget(`/api/demo/${k}`);
      if (r.status !== 200 || !Array.isArray(r.body?.items)) {
        kindsOk = false;
        kindsDetail = `${k}: ${JSON.stringify(r.body).slice(0, 120)}`;
        break;
      }
      // namespace filter must not break namespaced kinds
      if (!['nodes', 'namespaces', 'persistentvolumes', 'storageclasses', 'clusterroles', 'clusterrolebindings'].includes(k)) {
        const f = await jget(`/api/demo/${k}?namespace=production`);
        if (f.status !== 200 || !Array.isArray(f.body?.items)) {
          kindsOk = false;
          kindsDetail = `${k}?namespace=: ${JSON.stringify(f.body).slice(0, 120)}`;
          break;
        }
      }
    }
    check(`all ${kinds.length} list kinds (+ namespace filter)`, kindsOk, kindsDetail);

    const one = await jget('/api/demo/resources/deployments/production/checkout-api');
    check('GET single resource', one.status === 200 && one.body?.item?.metadata?.name === 'checkout-api');

    const yamlRes = await fetch(base + '/api/demo/resources/deployments/production/checkout-api/yaml');
    const yamlText = await yamlRes.text();
    check('GET resource YAML', yamlRes.status === 200 && yamlText.includes('checkout-api'), yamlText.slice(0, 120));

    const evFor = await jget('/api/demo/resources/pods/default/crashloop-backoff-demo-abc/events');
    check('GET events-for resource', evFor.status === 200 && Array.isArray(evFor.body?.items));

    const metrics = await jget('/api/demo/metrics/nodes');
    check(
      'GET metrics/nodes shape',
      metrics.status === 200 && Array.isArray(metrics.body?.items) && metrics.body.items.every((m) => m.name && m.cpuPct !== undefined),
      JSON.stringify(metrics.body).slice(0, 160),
    );

    const logs = await fetch(base + '/api/demo/pods/default/x/logs');
    check('GET pod logs (demo)', logs.status === 200 && (await logs.text()).length > 0);

    // ---- single-door: / must always lead to the UI, never a JSON blob ----
    const rootRes = await fetch(base + '/', { redirect: 'manual' });
    const rootBody = await rootRes.text();
    const rootCt = rootRes.headers.get('content-type') || '';
    check(
      'GET / serves a UI entry page (never the API JSON blob)',
      rootRes.status === 200 && rootCt.includes('text/html') && !rootBody.includes('"kubesword-server"'),
      `status=${rootRes.status} ct=${rootCt} body=${rootBody.slice(0, 100)}`,
    );

    // Dev mode (`npm start`): / redirects straight to the UI, even when a
    // (possibly stale) client/dist exists.
    const prevDev = process.env.KUBESWORD_DEV;
    const prevUi = process.env.KUBESWORD_UI_URL;
    process.env.KUBESWORD_DEV = '1';
    process.env.KUBESWORD_UI_URL = 'http://localhost:5999';
    const devServer = http.createServer(createApp(manager));
    await new Promise((resolve) => devServer.listen(0, '127.0.0.1', resolve));
    try {
      const r = await fetch(`http://127.0.0.1:${devServer.address().port}/`, { redirect: 'manual' });
      check(
        'dev GET / redirects (302) to the UI',
        r.status === 302 && r.headers.get('location') === 'http://localhost:5999',
        `status=${r.status} location=${r.headers.get('location')}`,
      );
    } finally {
      await new Promise((resolve) => devServer.close(resolve));
      if (prevDev === undefined) delete process.env.KUBESWORD_DEV;
      else process.env.KUBESWORD_DEV = prevDev;
      if (prevUi === undefined) delete process.env.KUBESWORD_UI_URL;
      else process.env.KUBESWORD_UI_URL = prevUi;
    }

    // ---- error paths ----
    const badKind = await jget('/api/demo/nope');
    check('bad kind -> 400 + JSON error', badKind.status === 400 && typeof badKind.body?.error === 'string');

    const badCluster = await jget('/api/nope/pods');
    check('bad cluster -> 404 + JSON error', badCluster.status === 404 && typeof badCluster.body?.error === 'string');

    const delDemo = await jdel('/api/demo/resources/pods/default/x');
    check('demo write-protection -> 400', delDemo.status === 400);

    const missing = await jget('/api/demo/resources/pods/default/does-not-exist');
    check('missing resource -> 404', missing.status === 404);

    // ---- WebSockets ----
    const WebSocket = require('ws');
    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/logs?cluster=demo&namespace=default&pod=x`);
      let n = 0;
      let protoOk = true;
      let settled = false;
      const done = (ok, detail) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* noop */ }
        check('WS /ws/logs streams JSON stdout', ok, detail);
        resolve();
      };
      const timer = setTimeout(() => done(false, 'timeout waiting for 3 messages'), 8000);
      ws.on('message', (d) => {
        try {
          const m = JSON.parse(d.toString());
          if (m.type !== 'stdout' || typeof m.data !== 'string') protoOk = false;
        } catch {
          protoOk = false;
        }
        if (++n >= 3) {
          clearTimeout(timer);
          done(protoOk, protoOk ? '' : 'non-JSON or wrong-shape message');
        }
      });
      ws.on('error', (e) => {
        clearTimeout(timer);
        done(false, e.message);
      });
    });

    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/exec?cluster=demo&namespace=default&pod=x`);
      let got = '';
      let settled = false;
      const done = (ok, detail) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* noop */ }
        check('WS /ws/exec demo shell answers', ok, detail);
        resolve();
      };
      const timer = setTimeout(() => done(false, `timeout, got: ${JSON.stringify(got.slice(0, 100))}`), 8000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'stdin', data: 'whoami\r' })));
      ws.on('message', (d) => {
        try {
          got += JSON.parse(d.toString()).data || '';
        } catch { /* ignore */ }
        if (got.includes('appuser')) done(true);
      });
      ws.on('error', (e) => done(false, e.message));
    });

    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/exec?cluster=nope&namespace=default&pod=x`);
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* noop */ }
        check('WS unknown cluster -> error message', false, 'timeout');
        resolve();
      }, 8000);
      ws.on('message', (d) => {
        try {
          if (JSON.parse(d.toString()).type === 'error') {
            clearTimeout(timer);
            try { ws.close(); } catch { /* noop */ }
            check('WS unknown cluster -> error message', true);
            resolve();
          }
        } catch { /* ignore */ }
      });
      ws.on('error', () => {
        clearTimeout(timer);
        check('WS unknown cluster -> error message', true);
        resolve();
      });
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpData, { recursive: true, force: true });
  }

  if (failures) {
    console.error(`[smoke] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[smoke] all checks passed ✓');
}

main().catch((e) => {
  console.error('[smoke] fatal:', e);
  process.exit(1);
});
