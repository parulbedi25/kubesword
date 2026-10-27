'use strict';

// Guards the server read-cache: TTL expiry, MISS/HIT behavior, and
// fresh-after-write invalidation on mutations.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCache } = require('../src/cache');
const { createApiRouter } = require('../src/routes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('createCache', () => {
  it('returns values set within the TTL', () => {
    const c = createCache(1000);
    c.set('k', { a: 1 });
    assert.deepEqual(c.get('k'), { a: 1 });
  });

  it('expires entries after the TTL', async () => {
    const c = createCache(30);
    c.set('k', 'v');
    assert.equal(c.get('k'), 'v');
    await sleep(50);
    assert.equal(c.get('k'), undefined);
  });

  it('clear() drops everything', () => {
    const c = createCache(1000);
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    assert.equal(c.get('a'), undefined);
    assert.equal(c.size, 0);
  });

  it('evicts oldest entries past maxEntries', () => {
    const c = createCache(1000, 2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    assert.equal(c.get('a'), undefined);
    assert.equal(c.get('b'), 2);
    assert.equal(c.get('c'), 3);
  });
});

describe('API read cache', () => {
  const calls = { list: 0, overview: 0 };
  const pod = (name) => ({
    metadata: { name, namespace: 'default', creationTimestamp: new Date().toISOString() },
  });
  const ok = (items) => ({ body: { items } });

  const fakeConn = {
    isDemo: false,
    name: 'fake',
    coreV1: {
      listNode: async () => ok([]),
      listNamespace: async () => ok([]),
      listPodForAllNamespaces: async () => {
        calls.list += 1;
        return ok([pod('p1')]);
      },
      listNamespacedPod: async () => ok([]),
      listEventForAllNamespaces: async () => ok([]),
      deleteNamespacedPod: async (name) => {
        if (name === 'boom') throw new Error('kaboom');
        return { body: {} };
      },
    },
    appsV1: {
      listDeploymentForAllNamespaces: async () => ok([]),
      listStatefulSetForAllNamespaces: async () => ok([]),
      listDaemonSetForAllNamespaces: async () => ok([]),
    },
    batchV1: {
      listJobForAllNamespaces: async () => ok([]),
      listCronJobForAllNamespaces: async () => ok([]),
    },
    versionApi: {
      getCode: async () => ({ body: { gitVersion: 'v9.9.9-test' } }),
    },
  };
  const manager = {
    get: (name) => {
      if (name !== 'fake') {
        const err = new Error(`Unknown cluster: ${name}`);
        err.statusCode = 404;
        throw err;
      }
      return fakeConn;
    },
  };

  let base;
  let server;
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(manager));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('serves repeated lists from cache (MISS then HIT)', async () => {
    const first = await fetch(`${base}/api/fake/pods`);
    assert.equal(first.headers.get('x-kubesword-cache'), 'MISS');
    assert.equal(calls.list, 1);
    const second = await fetch(`${base}/api/fake/pods`);
    assert.equal(second.headers.get('x-kubesword-cache'), 'HIT');
    assert.equal(calls.list, 1); // no second backend call
    assert.deepEqual(await second.json(), await first.json().then((j) => j));
  });

  it('invalidates the cache after a successful mutation', async () => {
    await fetch(`${base}/api/fake/pods`); // ensure cached
    const del = await fetch(`${base}/api/fake/resources/pods/default/p1`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    await sleep(50); // let res 'finish' fire
    const afterDel = await fetch(`${base}/api/fake/pods`);
    assert.equal(afterDel.headers.get('x-kubesword-cache'), 'MISS');
    assert.equal(calls.list, 2);
  });

  it('keeps the cache after a failed mutation', async () => {
    await fetch(`${base}/api/fake/pods`); // MISS, populates
    const before = calls.list;
    const del = await fetch(`${base}/api/fake/resources/pods/default/boom`, { method: 'DELETE' });
    assert.equal(del.status, 500);
    await sleep(50);
    const afterFail = await fetch(`${base}/api/fake/pods`);
    assert.equal(afterFail.headers.get('x-kubesword-cache'), 'HIT');
    assert.equal(calls.list, before);
  });

  it('caches overview responses', async () => {
    const first = await fetch(`${base}/api/fake/overview`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-kubesword-cache'), 'MISS');
    const body = await first.json();
    assert.equal(body.version, 'v9.9.9-test');
    assert.equal(body.counts.pods, 1);
    const second = await fetch(`${base}/api/fake/overview`);
    assert.equal(second.headers.get('x-kubesword-cache'), 'HIT');
    assert.deepEqual(await second.json(), body);
    void calls.overview;
  });
});
