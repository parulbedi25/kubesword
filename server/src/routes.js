'use strict';

/**
 * REST API for KubeSword.
 *
 * Cluster-scoped routes are prefixed with /api/:cluster/...
 * The `demo` cluster always answers with mock data; every other cluster
 * proxies to the Kubernetes API through @kubernetes/client-node.
 *
 * One KIND registry below drives list / get / delete / yaml for every
 * resource type, so all kinds behave identically (no per-kind drift).
 */

const express = require('express');
const yaml = require('js-yaml');
const mock = require('./mock-data');
const { createCache } = require('./cache');

// ---------------------------------------------------------------------------
// Kind registry
// ---------------------------------------------------------------------------
// api:      ClusterConnection client property (see k8s-manager.js)
// listAll:  list method across all namespaces (or cluster scope)
// listNs:   namespaced list method (null for cluster-scoped kinds)
// read/del: read/delete methods (del null = not deletable via API)
// demo:     mock-data array used for the `demo` cluster
const KINDS = {
  nodes:                  { api: 'coreV1',       listAll: 'listNode',                                   listNs: null,                        read: 'readNode',                                   del: null,                                        namespaced: false, demo: mock.NODES },
  namespaces:             { api: 'coreV1',       listAll: 'listNamespace',                              listNs: null,                        read: 'readNamespace',                              del: 'deleteNamespace',                            namespaced: false, demo: mock.NAMESPACES },
  pods:                   { api: 'coreV1',       listAll: 'listPodForAllNamespaces',                    listNs: 'listNamespacedPod',           read: 'readNamespacedPod',                          del: 'deleteNamespacedPod',                        namespaced: true,  demo: mock.PODS },
  deployments:            { api: 'appsV1',       listAll: 'listDeploymentForAllNamespaces',             listNs: 'listNamespacedDeployment',    read: 'readNamespacedDeployment',                   del: 'deleteNamespacedDeployment',                namespaced: true,  demo: mock.DEPLOYMENTS },
  statefulsets:           { api: 'appsV1',       listAll: 'listStatefulSetForAllNamespaces',            listNs: 'listNamespacedStatefulSet',   read: 'readNamespacedStatefulSet',                  del: 'deleteNamespacedStatefulSet',               namespaced: true,  demo: mock.STATEFULSETS },
  daemonsets:             { api: 'appsV1',       listAll: 'listDaemonSetForAllNamespaces',              listNs: 'listNamespacedDaemonSet',     read: 'readNamespacedDaemonSet',                    del: 'deleteNamespacedDaemonSet',                  namespaced: true,  demo: mock.DAEMONSETS },
  replicasets:            { api: 'appsV1',       listAll: 'listReplicaSetForAllNamespaces',             listNs: 'listNamespacedReplicaSet',    read: 'readNamespacedReplicaSet',                   del: 'deleteNamespacedReplicaSet',                namespaced: true,  demo: mock.REPLICASETS },
  jobs:                   { api: 'batchV1',      listAll: 'listJobForAllNamespaces',                    listNs: 'listNamespacedJob',          read: 'readNamespacedJob',                          del: 'deleteNamespacedJob',                        namespaced: true,  demo: mock.JOBS },
  cronjobs:               { api: 'batchV1',      listAll: 'listCronJobForAllNamespaces',                listNs: 'listNamespacedCronJob',      read: 'readNamespacedCronJob',                      del: 'deleteNamespacedCronJob',                    namespaced: true,  demo: mock.CRONJOBS },
  services:               { api: 'coreV1',       listAll: 'listServiceForAllNamespaces',                listNs: 'listNamespacedService',      read: 'readNamespacedService',                      del: 'deleteNamespacedService',                    namespaced: true,  demo: mock.SERVICES },
  ingresses:              { api: 'networkingV1', listAll: 'listIngressForAllNamespaces',                listNs: 'listNamespacedIngress',      read: 'readNamespacedIngress',                      del: 'deleteNamespacedIngress',                    namespaced: true,  demo: mock.INGRESSES },
  networkpolicies:        { api: 'networkingV1', listAll: 'listNetworkPolicyForAllNamespaces',          listNs: 'listNamespacedNetworkPolicy', read: 'readNamespacedNetworkPolicy',                del: 'deleteNamespacedNetworkPolicy',              namespaced: true,  demo: mock.NETWORKPOLICIES },
  endpoints:              { api: 'coreV1',       listAll: 'listEndpointsForAllNamespaces',              listNs: 'listNamespacedEndpoints',    read: 'readNamespacedEndpoints',                    del: 'deleteNamespacedEndpoints',                  namespaced: true,  demo: mock.ENDPOINTS },
  configmaps:             { api: 'coreV1',       listAll: 'listConfigMapForAllNamespaces',              listNs: 'listNamespacedConfigMap',    read: 'readNamespacedConfigMap',                    del: 'deleteNamespacedConfigMap',                  namespaced: true,  demo: mock.CONFIGMAPS },
  secrets:                { api: 'coreV1',       listAll: 'listSecretForAllNamespaces',                 listNs: 'listNamespacedSecret',       read: 'readNamespacedSecret',                       del: 'deleteNamespacedSecret',                     namespaced: true,  demo: mock.SECRETS },
  persistentvolumeclaims: { api: 'coreV1',       listAll: 'listPersistentVolumeClaimForAllNamespaces',  listNs: 'listNamespacedPersistentVolumeClaim', read: 'readNamespacedPersistentVolumeClaim',    del: 'deleteNamespacedPersistentVolumeClaim',      namespaced: true,  demo: mock.PVCS },
  persistentvolumes:      { api: 'coreV1',       listAll: 'listPersistentVolume',                       listNs: null,                        read: 'readPersistentVolume',                       del: 'deletePersistentVolume',                     namespaced: false, demo: mock.PVS },
  storageclasses:         { api: 'storageV1',    listAll: 'listStorageClass',                           listNs: null,                        read: 'readStorageClass',                           del: 'deleteStorageClass',                         namespaced: false, demo: mock.STORAGECLASSES },
  roles:                  { api: 'rbacV1',       listAll: 'listRoleForAllNamespaces',                   listNs: 'listNamespacedRole',        read: 'readNamespacedRole',                         del: 'deleteNamespacedRole',                       namespaced: true,  demo: mock.ROLES },
  rolebindings:           { api: 'rbacV1',       listAll: 'listRoleBindingForAllNamespaces',            listNs: 'listNamespacedRoleBinding', read: 'readNamespacedRoleBinding',                  del: 'deleteNamespacedRoleBinding',                namespaced: true,  demo: mock.ROLEBINDINGS },
  clusterroles:           { api: 'rbacV1',       listAll: 'listClusterRole',                             listNs: null,                        read: 'readClusterRole',                            del: 'deleteClusterRole',                          namespaced: false, demo: mock.CLUSTER_ROLES },
  clusterrolebindings:    { api: 'rbacV1',       listAll: 'listClusterRoleBinding',                      listNs: null,                        read: 'readClusterRoleBinding',                     del: 'deleteClusterRoleBinding',                   namespaced: false, demo: mock.CLUSTERROLEBINDINGS },
  serviceaccounts:        { api: 'coreV1',       listAll: 'listServiceAccountForAllNamespaces',         listNs: 'listNamespacedServiceAccount', read: 'readNamespacedServiceAccount',              del: 'deleteNamespacedServiceAccount',             namespaced: true,  demo: mock.SERVICE_ACCOUNTS },
  hpas:                   { api: 'autoscalingV2', listAll: 'listHorizontalPodAutoscalerForAllNamespaces', listNs: 'listNamespacedHorizontalPodAutoscaler', read: 'readNamespacedHorizontalPodAutoscaler',   del: 'deleteNamespacedHorizontalPodAutoscaler',    namespaced: true,  demo: mock.HPAS },
  events:                 { api: 'coreV1',       listAll: 'listEventForAllNamespaces',                  listNs: 'listNamespacedEvent',        read: 'readNamespacedEvent',                        del: null,                                        namespaced: true,  demo: mock.EVENTS },
};
// Short aliases kept for backward compatibility with older clients.
KINDS.pvcs = KINDS.persistentvolumeclaims;
KINDS.pvs = KINDS.persistentvolumes;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const itemsOf = (res) => (res && res.body && res.body.items) || [];
const allNs = (ns) => !ns || ns === 'all';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function byAgeDesc(a, b) {
  return new Date(b.metadata?.creationTimestamp || 0) - new Date(a.metadata?.creationTimestamp || 0);
}

// Run fetches independently: one failing list must not blank the whole page.
async function tryAll(jobs) {
  const out = await Promise.all(
    jobs.map((fn) =>
      Promise.resolve()
        .then(fn)
        .catch((e) => ({ __kubeswordError: e?.body?.message || e?.message || String(e) })),
    ),
  );
  return out.map((v) => (v && v.__kubeswordError ? [] : v));
}

function kindOr400(res, kind) {
  const def = KINDS[kind];
  if (!def) res.status(400).json({ error: `unsupported kind: ${kind}` });
  return def;
}

// Quantity parsers for metrics (cpu: "850m"/"2"/"150000000n", memory: "...Ki/Mi/Gi")
function parseCpu(q) {
  if (q == null) return NaN;
  const m = /^(-?\d+(?:\.\d+)?)(n|u|m|k|M|G)?$/.exec(String(q).trim());
  if (!m) return NaN;
  const mult = { n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1;
  return Number(m[1]) * mult;
}

function parseMem(q) {
  if (q == null) return NaN;
  const m = /^(-?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E|m|)?$/.exec(String(q).trim());
  if (!m) return NaN;
  const mult =
    { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
      k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, m: 1e-3, '': 1 }[m[2]];
  return Number(m[1]) * mult;
}

function fmtCpu(cores) {
  if (!Number.isFinite(cores)) return '?';
  return cores < 1 ? `${Math.round(cores * 1000)}m` : `${cores.toFixed(cores < 10 ? 2 : 1)}`;
}

function fmtMem(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  const mib = bytes / 1024 ** 2;
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)}Gi` : `${Math.round(mib)}Mi`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function createApiRouter(manager) {
  const router = express.Router();

  // Read caches: lists + overview are the hot path against slow/remote
  // clusters. Short TTLs keep data fresh; any successful mutation below
  // clears them, so reads-after-write never go stale.
  const overviewCache = createCache(10000);
  const listCache = createCache(5000);
  const metricsCache = createCache(10000);
  const invalidateCaches = () => {
    overviewCache.clear();
    listCache.clear();
    metricsCache.clear();
  };
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateCaches();
    });
    next();
  });

  // ---------------- cluster management ----------------
  router.get('/clusters', (req, res) => {
    res.json({ current: manager.currentContext, clusters: manager.listClusters() });
  });

  router.post('/clusters/reload', (req, res) => {
    manager.reload();
    res.json({ current: manager.currentContext, clusters: manager.listClusters() });
  });

  router.post('/clusters/switch', (req, res) => {
    res.json(manager.switchCluster(req.body && req.body.context));
  });

  router.post('/clusters', (req, res) => {
    const { name, kubeconfig } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!kubeconfig) return res.status(400).json({ error: 'kubeconfig is required' });
    res.json(manager.addKubeconfig(name, kubeconfig));
  });

  router.delete('/clusters/:name', (req, res) => {
    res.json(manager.removeCluster(req.params.name));
  });

  // ---------------- cluster info ----------------
  router.get('/:cluster/info', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      return res.json({ name: 'demo', server: 'demo://kubesword.local', version: 'v1.30.2', isDemo: true });
    }
    try {
      const v = await conn.versionApi.getCode();
      res.json({ name: conn.name, server: manager.serverOf(conn), version: v.body && v.body.gitVersion, isDemo: false });
    } catch (e) {
      res.json({
        name: conn.name, server: manager.serverOf(conn), version: 'unknown', isDemo: false,
        error: (e && (e.body?.message || e.message)) || 'unreachable',
      });
    }
  }));

  // ---------------- overview ----------------
  router.get('/:cluster/overview', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.json({ ...mock.overview(), isDemo: true });

    const cacheKey = `overview:${req.params.cluster}`;
    const cached = overviewCache.get(cacheKey);
    if (cached) {
      res.set('X-KubeSword-Cache', 'HIT');
      return res.json(cached);
    }

    const [lists, version] = await Promise.all([
      tryAll([
        () => conn.coreV1.listNode().then(itemsOf),
        () => conn.coreV1.listNamespace().then(itemsOf),
        () => conn.coreV1.listPodForAllNamespaces().then(itemsOf),
        () => conn.appsV1.listDeploymentForAllNamespaces().then(itemsOf),
        () => conn.appsV1.listStatefulSetForAllNamespaces().then(itemsOf),
        () => conn.appsV1.listDaemonSetForAllNamespaces().then(itemsOf),
        () => conn.batchV1.listJobForAllNamespaces().then(itemsOf),
        () => conn.batchV1.listCronJobForAllNamespaces().then(itemsOf),
        () => conn.coreV1.listEventForAllNamespaces().then(itemsOf),
      ]),
      conn.versionApi.getCode().then((v) => v.body && v.body.gitVersion).catch(() => 'unknown'),
    ]);
    const [nodes, namespaces, pods, deps, sts, ds, jobs, cron, events] = lists;
    const payload = {
      ...mock.buildOverview({
        nodes: nodes.length, namespaces: namespaces.length, pods,
        deployments: deps.length, statefulsets: sts.length, daemonsets: ds.length,
        jobs: jobs.length, cronjobs: cron.length, version, events,
      }),
      isDemo: false,
    };
    overviewCache.set(cacheKey, payload);
    res.set('X-KubeSword-Cache', 'MISS');
    res.json(payload);
  }));

  // ---------------- generic list: GET /:cluster/<kind>?namespace= ----------------
  router.get('/:cluster/:kind', asyncHandler(async (req, res) => {
    const { cluster, kind } = req.params;
    if (kind === 'metrics' || kind === 'portforward' || kind === 'apply' || kind === 'resources' || kind === 'clusters') {
      return res.status(404).json({ error: 'not found' });
    }
    const def = kindOr400(res, kind);
    if (!def) return;
    const conn = manager.get(cluster);
    const ns = req.query.namespace || 'all';

    if (conn.isDemo) {
      const items = (def.demo || []).filter((i) => allNs(ns) || i.metadata?.namespace === ns);
      return res.json({ items: [...items].sort(byAgeDesc), isDemo: true });
    }
    const cacheKey = `list:${cluster}:${kind}:${ns}`;
    const cached = listCache.get(cacheKey);
    if (cached) {
      res.set('X-KubeSword-Cache', 'HIT');
      return res.json(cached);
    }
    const api = conn[def.api];
    const items =
      def.namespaced && !allNs(ns) ? itemsOf(await api[def.listNs](ns)) : itemsOf(await api[def.listAll]());
    const scoped = def.namespaced ? items.filter((i) => allNs(ns) || i.metadata?.namespace === ns) : items;
    const sorted = [...scoped].sort(byAgeDesc);
    // Events can number in the thousands; newest-first with a sane cap.
    const out = kind === 'events' ? sorted.slice(0, 500) : sorted;
    const payload = { items: out, isDemo: false };
    listCache.set(cacheKey, payload);
    res.set('X-KubeSword-Cache', 'MISS');
    res.json(payload);
  }));

  // ---------------- single resource: read / delete ----------------
  router.get('/:cluster/resources/:kind/:namespace/:name', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const def = kindOr400(res, kind);
    if (!def) return;
    if (!def.read) return res.status(400).json({ error: `read unsupported for kind: ${kind}` });
    const conn = manager.get(cluster);
    if (conn.isDemo) {
      const item = (def.demo || []).find(
        (x) => x.metadata?.name === name && (!def.namespaced || x.metadata?.namespace === namespace),
      );
      if (!item) return res.status(404).json({ error: 'not found' });
      return res.json({ item, isDemo: true });
    }
    const api = conn[def.api];
    const r = def.namespaced ? await api[def.read](name, namespace) : await api[def.read](name);
    res.json({ item: r.body, isDemo: false });
  }));

  router.delete('/:cluster/resources/:kind/:namespace/:name', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const def = kindOr400(res, kind);
    if (!def) return;
    const conn = manager.get(cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    if (!def.del) return res.status(400).json({ error: `delete unsupported for kind: ${kind}` });
    const api = conn[def.api];
    if (def.namespaced) await api[def.del](name, namespace);
    else await api[def.del](name);
    res.json({ deleted: `${kind}/${namespace}/${name}` });
  }));

  // ---------------- yaml ----------------
  router.get('/:cluster/resources/:kind/:namespace/:name/yaml', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const def = kindOr400(res, kind);
    if (!def) return;
    if (!def.read) return res.status(400).json({ error: `read unsupported for kind: ${kind}` });
    const conn = manager.get(cluster);
    let obj;
    if (conn.isDemo) {
      obj = (def.demo || []).find(
        (x) => x.metadata?.name === name && (!def.namespaced || x.metadata?.namespace === namespace),
      );
      if (!obj) return res.status(404).json({ error: 'not found' });
    } else {
      const api = conn[def.api];
      const r = def.namespaced ? await api[def.read](name, namespace) : await api[def.read](name);
      obj = r.body;
    }
    const clean = JSON.parse(JSON.stringify(obj));
    if (clean.metadata) {
      delete clean.metadata.managedFields;
      delete clean.metadata.resourceVersion;
    }
    delete clean.status;
    res.type('text/yaml').send(yaml.dump(clean, { noRefs: true }));
  }));

  // ---------------- events for one object ----------------
  router.get('/:cluster/resources/:kind/:namespace/:name/events', asyncHandler(async (req, res) => {
    const { cluster, namespace, name } = req.params;
    const conn = manager.get(cluster);
    if (conn.isDemo) {
      const items = mock.EVENTS.filter((e) => !e.metadata?.namespace || e.metadata.namespace === namespace);
      return res.json({ items, isDemo: true });
    }
    const all = itemsOf(await conn.coreV1.listNamespacedEvent(namespace));
    // Exact object match first; fall back to same-name-prefix (ReplicaSet
    // events reference the set while the user views a pod, etc.).
    const exact = all.filter((e) => e.involvedObject?.name === name);
    const prefix = name.includes('-') ? all.filter((e) => e.involvedObject?.name?.startsWith(name.slice(0, name.lastIndexOf('-')))) : [];
    const merged = [...new Map([...exact, ...prefix].map((e) => [e.metadata?.uid || e.message, e])).values()];
    merged.sort((a, b) => new Date(b.lastTimestamp || b.eventTime || 0) - new Date(a.lastTimestamp || a.eventTime || 0));
    res.json({ items: merged.slice(0, 100), isDemo: false });
  }));

  // ---------------- pod logs (one-shot) ----------------
  router.get('/:cluster/pods/:namespace/:name/logs', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.type('text/plain').send(mock.DEMO_LOGS);
    const r = await conn.coreV1.readNamespacedPodLog(
      req.params.name,
      req.params.namespace,
      req.query.container || undefined,
      undefined, // follow
      undefined, // insecureSkipTLSVerifyBackend
      undefined, // limitBytes
      undefined, // pretty
      req.query.previous === 'true', // previous
      undefined, // sinceSeconds
      req.query.tailLines ? Number(req.query.tailLines) : 500, // tailLines
      true, // timestamps
    );
    res.type('text/plain').send(typeof r.body === 'string' ? r.body : String(r.body ?? ''));
  }));

  // ---------------- namespaces ----------------
  router.post('/:cluster/namespaces', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const name = (req.body?.name || '').trim().toLowerCase();
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      return res.status(400).json({ error: 'invalid namespace name' });
    }
    const r = await conn.coreV1.createNamespace({ metadata: { name } });
    res.json({ item: r.body });
  }));

  // ---------------- workload actions ----------------
  router.post('/:cluster/deployments/:namespace/:name/restart', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const patch = { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } } };
    await conn.appsV1.patchNamespacedDeployment(req.params.name, req.params.namespace, patch, undefined, undefined, undefined, undefined, {
      headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
    });
    res.json({ restarted: req.params.name });
  }));

  async function scale(kind, req, res) {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const replicas = Number(req.body?.replicas);
    if (!Number.isInteger(replicas) || replicas < 0 || replicas > 1000) {
      return res.status(400).json({ error: 'replicas must be an integer 0–1000' });
    }
    const { name, namespace } = req.params;
    const cap = kind === 'deployments' ? 'Deployment' : 'StatefulSet';
    const scaleObj = await conn.appsV1[`readNamespaced${cap}Scale`](name, namespace);
    scaleObj.body.spec.replicas = replicas;
    await conn.appsV1[`replaceNamespaced${cap}Scale`](name, namespace, scaleObj.body);
    res.json({ scaled: name, replicas });
  }
  router.put('/:cluster/deployments/:namespace/:name/scale', asyncHandler((req, res) => scale('deployments', req, res)));
  router.put('/:cluster/statefulsets/:namespace/:name/scale', asyncHandler((req, res) => scale('statefulsets', req, res)));

  // ---------------- metrics (metrics-server, optional) ----------------
  router.get('/:cluster/metrics/nodes', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      const d = mock.metricsFor(mock.NODES, mock.PODS);
      return res.json({
        items: d.nodes.map((n) => ({
          name: n.name, cpu: n.cpu.usage, cpuPct: n.cpuPercent, mem: n.memory.usage, memPct: n.memoryPercent,
        })),
        isDemo: true,
      });
    }
    const cacheKey = `metrics:nodes:${req.params.cluster}`;
    const cached = metricsCache.get(cacheKey);
    if (cached) {
      res.set('X-KubeSword-Cache', 'HIT');
      return res.json(cached);
    }
    try {
      const [m, nodes] = await Promise.all([
        conn.customObjects.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'nodes'),
        conn.coreV1.listNode(),
      ]);
      const caps = {};
      for (const n of itemsOf(nodes)) caps[n.metadata?.name] = n.status?.allocatable || n.status?.capacity || {};
      const items = itemsOf(m).map((x) => {
        const cap = caps[x.metadata?.name] || {};
        const cpuUsed = parseCpu(x.usage?.cpu);
        const cpuCap = parseCpu(cap.cpu);
        const memUsed = parseMem(x.usage?.memory);
        const memCap = parseMem(cap.memory);
        return {
          name: x.metadata?.name,
          cpu: fmtCpu(cpuUsed),
          cpuPct: cpuCap > 0 ? Math.round((cpuUsed / cpuCap) * 100) : undefined,
          mem: fmtMem(memUsed),
          memPct: memCap > 0 ? Math.round((memUsed / memCap) * 100) : undefined,
        };
      });
      const payload = { items, isDemo: false };
      metricsCache.set(cacheKey, payload);
      res.set('X-KubeSword-Cache', 'MISS');
      res.json(payload);
    } catch (e) {
      res.json({ items: [], isDemo: false, unavailable: true, message: 'metrics-server not available' });
    }
  }));

  router.get('/:cluster/metrics/pods', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    const ns = req.query.namespace;
    if (conn.isDemo) return res.json({ items: mock.metricsFor(mock.NODES, mock.PODS).pods, isDemo: true });
    try {
      const r = allNs(ns)
        ? await conn.customObjects.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'pods')
        : await conn.customObjects.listNamespacedCustomObject('metrics.k8s.io', 'v1beta1', ns, 'pods');
      res.json({ items: r.body?.items || [], isDemo: false });
    } catch (e) {
      res.json({ items: [], isDemo: false, unavailable: true, message: 'metrics-server not available' });
    }
  }));

  // ---------------- kubectl-apply style endpoint ----------------
  router.post('/:cluster/apply', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    let docs;
    try {
      docs = yaml.loadAll(req.body?.yaml || '');
    } catch (e) {
      return res.status(400).json({ error: `invalid YAML: ${e.message}` });
    }
    const { KubernetesObjectApi } = require('@kubernetes/client-node');
    const objApi = KubernetesObjectApi.makeApiClient(conn.kc);
    const results = [];
    for (const doc of docs) {
      if (!doc || !doc.kind || !doc.metadata?.name) {
        if (doc && typeof doc === 'object' && Object.keys(doc).length) {
          results.push({ kind: doc.kind || '?', name: '?', error: 'document is missing kind or metadata.name' });
        }
        continue;
      }
      try {
        await objApi.create(doc);
        results.push({ kind: doc.kind, name: doc.metadata.name, action: 'created' });
      } catch (createErr) {
        if (createErr?.statusCode === 409 || /already exists/i.test(createErr?.body?.message || '')) {
          try {
            await objApi.patch(doc);
            results.push({ kind: doc.kind, name: doc.metadata.name, action: 'patched' });
          } catch (patchErr) {
            results.push({ kind: doc.kind, name: doc.metadata.name, error: patchErr?.body?.message || patchErr.message });
          }
        } else {
          results.push({ kind: doc.kind, name: doc.metadata.name, error: createErr?.body?.message || createErr.message });
        }
      }
    }
    res.json({ results });
  }));

  return router;
}

module.exports = { createApiRouter, KINDS };
