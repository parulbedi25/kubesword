'use strict';

/**
 * REST API for KubeSword.
 * All cluster-scoped routes are prefixed with /api/:cluster/...
 * When the `demo` cluster is selected, realistic mock data is returned.
 */

const express = require('express');
const yaml = require('js-yaml');
const mock = require('./mock-data');

function bodyItems(res) {
  return (res && res.body && res.body.items) || [];
}

function filterNs(items, ns) {
  if (!ns || ns === 'all') return items;
  return items.filter((i) => i.metadata && i.metadata.namespace === ns);
}

function sortByAgeDesc(items) {
  return items.sort((a, b) => new Date(b.metadata?.creationTimestamp || 0) - new Date(a.metadata?.creationTimestamp || 0));
}

function demoList(items, ns) {
  return sortByAgeDesc(filterNs(items, ns));
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function createApiRouter(manager) {
  const router = express.Router();

  // ---------- cluster management ----------
  router.get('/clusters', (req, res) => {
    res.json({ current: manager.currentContext, clusters: manager.listClusters() });
  });

  router.post('/clusters/reload', (req, res) => {
    manager.reload();
    res.json({ current: manager.currentContext, clusters: manager.listClusters() });
  });

  router.post('/clusters/switch', (req, res) => {
    res.json(manager.switchCluster(req.body.context));
  });

  router.post('/clusters', (req, res) => {
    const { name, kubeconfig } = req.body || {};
    if (!kubeconfig) return res.status(400).json({ error: 'kubeconfig is required' });
    res.json(manager.addKubeconfig(name, kubeconfig));
  });

  router.delete('/clusters/:name', (req, res) => {
    res.json(manager.removeCluster(req.params.name));
  });

  router.get('/:cluster/info', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      return res.json({ version: { gitVersion: 'v1.30.2' }, server: 'demo://kubesword.local', isDemo: true });
    }
    try {
      const v = await conn.versionApi.getCode();
      res.json({ version: v.body, server: manager.serverOf(conn), isDemo: false });
    } catch (e) {
      res.json({ version: { gitVersion: 'unknown' }, server: manager.serverOf(conn), isDemo: false, error: String(e.message || e) });
    }
  }));

  // ---------- overview ----------
  router.get('/:cluster/overview', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      return res.json({ ...mock.overview(), isDemo: true, metrics: mock.metricsFor(mock.NODES, mock.PODS) });
    }
    const [nodes, pods, deps, sts, ds, jobs, cron, svcs, ings, cms, secrets, pvcs, pvs, events] = await Promise.all([
      conn.coreV1.listNode().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listPodForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.appsV1.listDeploymentForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.appsV1.listStatefulSetForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.appsV1.listDaemonSetForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.batchV1.listJobForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.batchV1.listCronJobForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listServiceForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.networkingV1.listIngressForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listConfigMapForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listSecretForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listPersistentVolumeClaimForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listPersistentVolume().then((r) => bodyItems(r)).catch(() => []),
      conn.coreV1.listEventForAllNamespaces().then((r) => bodyItems(r)).catch(() => []),
    ]);
    const phases = {};
    let restarts = 0;
    for (const p of pods) {
      const ph = p.status?.phase || 'Unknown';
      phases[ph] = (phases[ph] || 0) + 1;
      for (const c of p.status?.containerStatuses || []) restarts += c.restartCount || 0;
    }
    res.json({
      counts: {
        nodes: nodes.length, namespaces: new Set(pods.map((p) => p.metadata?.namespace)).size,
        pods: pods.length, deployments: deps.length, statefulsets: sts.length,
        daemonsets: ds.length, jobs: jobs.length, cronjobs: cron.length,
        services: svcs.length, ingresses: ings.length, configmaps: cms.length,
        secrets: secrets.length, pvcs: pvcs.length, pvs: pvs.length,
      },
      podsByPhase: phases,
      warnings: events.filter((e) => e.type === 'Warning').length,
      restarts,
      isDemo: false,
    });
  }));

  // ---------- generic list helper ----------
  async function listOrDemo(req, res, demoItems, fetchFn) {
    const conn = manager.get(req.params.cluster);
    const ns = req.query.namespace || 'all';
    if (conn.isDemo) return res.json({ items: demoList(demoItems, ns), isDemo: true });
    const items = await fetchFn(conn, ns);
    res.json({ items: sortByAgeDesc(items), isDemo: false });
  }

  const allNs = (ns) => !ns || ns === 'all';

  // nodes
  router.get('/:cluster/nodes', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.NODES, async (c) => bodyItems(await c.coreV1.listNode()))));
  router.get('/:cluster/nodes/:name', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      const n = mock.NODES.find((x) => x.metadata.name === req.params.name);
      if (!n) return res.status(404).json({ error: 'not found' });
      return res.json({ item: n, isDemo: true });
    }
    const r = await conn.coreV1.readNode(req.params.name);
    res.json({ item: r.body, isDemo: false });
  }));

  // namespaces
  router.get('/:cluster/namespaces', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.NAMESPACES.map((n) => ({ ...n })), async (c) => bodyItems(await c.coreV1.listNamespace()))));
  router.post('/:cluster/namespaces', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const r = await conn.coreV1.createNamespace({ metadata: { name: req.body.name } });
    res.json({ item: r.body });
  }));
  router.delete('/:cluster/namespaces/:name', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    await conn.coreV1.deleteNamespace(req.params.name);
    res.json({ deleted: req.params.name });
  }));

  // pods
  router.get('/:cluster/pods', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.PODS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listPodForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedPod(ns)))));
  router.get('/:cluster/pods/:namespace/:name', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) {
      const p = mock.PODS.find((x) => x.metadata.namespace === req.params.namespace && x.metadata.name === req.params.name);
      if (!p) return res.status(404).json({ error: 'not found' });
      return res.json({ item: p, isDemo: true });
    }
    const r = await conn.coreV1.readNamespacedPod(req.params.name, req.params.namespace);
    res.json({ item: r.body, isDemo: false });
  }));
  router.delete('/:cluster/pods/:namespace/:name', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    await conn.coreV1.deleteNamespacedPod(req.params.name, req.params.namespace);
    res.json({ deleted: req.params.name });
  }));
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

  // deployments
  router.get('/:cluster/deployments', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.DEPLOYMENTS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.appsV1.listDeploymentForAllNamespaces())
      : bodyItems(await c.appsV1.listNamespacedDeployment(ns)))));
  router.post('/:cluster/deployments/:namespace/:name/restart', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const patch = { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } } };
    await conn.appsV1.patchNamespacedDeployment(req.params.name, req.params.namespace, patch, undefined, undefined, undefined, undefined, { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } });
    res.json({ restarted: req.params.name });
  }));
  router.put('/:cluster/deployments/:namespace/:name/scale', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const scale = await conn.appsV1.readNamespacedDeploymentScale(req.params.name, req.params.namespace);
    scale.body.spec.replicas = Number(req.body.replicas);
    await conn.appsV1.replaceNamespacedDeploymentScale(req.params.name, req.params.namespace, scale.body);
    res.json({ scaled: req.params.name, replicas: Number(req.body.replicas) });
  }));
  router.delete('/:cluster/deployments/:namespace/:name', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    await conn.appsV1.deleteNamespacedDeployment(req.params.name, req.params.namespace);
    res.json({ deleted: req.params.name });
  }));
  // generic scale for statefulsets
  router.put('/:cluster/statefulsets/:namespace/:name/scale', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const scale = await conn.appsV1.readNamespacedStatefulSetScale(req.params.name, req.params.namespace);
    scale.body.spec.replicas = Number(req.body.replicas);
    await conn.appsV1.replaceNamespacedStatefulSetScale(req.params.name, req.params.namespace, scale.body);
    res.json({ scaled: req.params.name, replicas: Number(req.body.replicas) });
  }));

  // statefulsets / daemonsets / jobs / cronjobs
  router.get('/:cluster/statefulsets', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.STATEFULSETS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.appsV1.listStatefulSetForAllNamespaces())
      : bodyItems(await c.appsV1.listNamespacedStatefulSet(ns)))));
  router.get('/:cluster/daemonsets', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.DAEMONSETS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.appsV1.listDaemonSetForAllNamespaces())
      : bodyItems(await c.appsV1.listNamespacedDaemonSet(ns)))));
  router.get('/:cluster/jobs', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.JOBS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.batchV1.listJobForAllNamespaces())
      : bodyItems(await c.batchV1.listNamespacedJob(ns)))));
  router.get('/:cluster/cronjobs', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.CRONJOBS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.batchV1.listCronJobForAllNamespaces())
      : bodyItems(await c.batchV1.listNamespacedCronJob(ns)))));

  // services / ingresses / endpoints
  router.get('/:cluster/services', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.SERVICES, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listServiceForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedService(ns)))));
  router.get('/:cluster/ingresses', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.INGRESSES, async (c, ns) => allNs(ns)
      ? bodyItems(await c.networkingV1.listIngressForAllNamespaces())
      : bodyItems(await c.networkingV1.listNamespacedIngress(ns)))));
  router.get('/:cluster/endpoints', asyncHandler((req, res) =>
    listOrDemo(req, res, [], async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listEndpointsForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedEndpoints(ns)))));
  router.get('/:cluster/networkpolicies', asyncHandler((req, res) =>
    listOrDemo(req, res, [], async (c, ns) => allNs(ns)
      ? bodyItems(await c.networkingV1.listNetworkPolicyForAllNamespaces())
      : bodyItems(await c.networkingV1.listNamespacedNetworkPolicy(ns)))));

  // configmaps / secrets
  router.get('/:cluster/configmaps', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.CONFIGMAPS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listConfigMapForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedConfigMap(ns)))));
  router.get('/:cluster/secrets', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.SECRETS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listSecretForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedSecret(ns)))));

  // storage
  router.get('/:cluster/pvcs', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.PVCS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listPersistentVolumeClaimForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedPersistentVolumeClaim(ns)))));
  router.get('/:cluster/pvs', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.PVS, async (c) => bodyItems(await c.coreV1.listPersistentVolume()))));
  router.get('/:cluster/storageclasses', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.STORAGECLASSES, async (c) => bodyItems(await c.storageV1.listStorageClass()))));

  // autoscaling
  router.get('/:cluster/hpas', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.HPAS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.autoscalingV2.listHorizontalPodAutoscalerForAllNamespaces())
      : bodyItems(await c.autoscalingV2.listNamespacedHorizontalPodAutoscaler(ns)))));

  // rbac
  router.get('/:cluster/serviceaccounts', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.SERVICE_ACCOUNTS, async (c, ns) => allNs(ns)
      ? bodyItems(await c.coreV1.listServiceAccountForAllNamespaces())
      : bodyItems(await c.coreV1.listNamespacedServiceAccount(ns)))));
  router.get('/:cluster/clusterroles', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.CLUSTER_ROLES, async (c) => bodyItems(await c.rbacV1.listClusterRole()))));
  router.get('/:cluster/roles', asyncHandler((req, res) =>
    listOrDemo(req, res, [], async (c, ns) => allNs(ns)
      ? bodyItems(await c.rbacV1.listRoleForAllNamespaces())
      : bodyItems(await c.rbacV1.listNamespacedRole(ns)))));

  // events
  router.get('/:cluster/events', asyncHandler((req, res) =>
    listOrDemo(req, res, mock.EVENTS, async (c, ns) => {
      const items = allNs(ns)
        ? bodyItems(await c.coreV1.listEventForAllNamespaces())
        : bodyItems(await c.coreV1.listNamespacedEvent(ns));
      return items.slice(-200).reverse();
    })));

  // metrics (metrics-server)
  router.get('/:cluster/metrics/nodes', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.json({ items: mock.metricsFor(mock.NODES, mock.PODS).nodes, isDemo: true });
    try {
      const r = await conn.customObjects.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'nodes');
      res.json({ items: r.body.items || [], isDemo: false });
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
      res.json({ items: r.body.items || [], isDemo: false });
    } catch (e) {
      res.json({ items: [], isDemo: false, unavailable: true, message: 'metrics-server not available' });
    }
  }));

  // ---------- generic resource: read / delete / yaml ----------
  const KIND_MAP = {
    pods: { api: 'coreV1', read: 'readNamespacedPod', del: 'deleteNamespacedPod', namespaced: true },
    deployments: { api: 'appsV1', read: 'readNamespacedDeployment', del: 'deleteNamespacedDeployment', namespaced: true },
    statefulsets: { api: 'appsV1', read: 'readNamespacedStatefulSet', del: 'deleteNamespacedStatefulSet', namespaced: true },
    daemonsets: { api: 'appsV1', read: 'readNamespacedDaemonSet', del: 'deleteNamespacedDaemonSet', namespaced: true },
    jobs: { api: 'batchV1', read: 'readNamespacedJob', del: 'deleteNamespacedJob', namespaced: true },
    cronjobs: { api: 'batchV1', read: 'readNamespacedCronJob', del: 'deleteNamespacedCronJob', namespaced: true },
    services: { api: 'coreV1', read: 'readNamespacedService', del: 'deleteNamespacedService', namespaced: true },
    ingresses: { api: 'networkingV1', read: 'readNamespacedIngress', del: 'deleteNamespacedIngress', namespaced: true },
    configmaps: { api: 'coreV1', read: 'readNamespacedConfigMap', del: 'deleteNamespacedConfigMap', namespaced: true },
    secrets: { api: 'coreV1', read: 'readNamespacedSecret', del: 'deleteNamespacedSecret', namespaced: true },
    pvcs: { api: 'coreV1', read: 'readNamespacedPersistentVolumeClaim', del: 'deleteNamespacedPersistentVolumeClaim', namespaced: true },
    pvs: { api: 'coreV1', read: 'readPersistentVolume', del: 'deletePersistentVolume', namespaced: false },
    storageclasses: { api: 'storageV1', read: 'readStorageClass', del: 'deleteStorageClass', namespaced: false },
    hpas: { api: 'autoscalingV2', read: 'readNamespacedHorizontalPodAutoscaler', del: 'deleteNamespacedHorizontalPodAutoscaler', namespaced: true },
    serviceaccounts: { api: 'coreV1', read: 'readNamespacedServiceAccount', del: 'deleteNamespacedServiceAccount', namespaced: true },
    roles: { api: 'rbacV1', read: 'readNamespacedRole', del: 'deleteNamespacedRole', namespaced: true },
    clusterroles: { api: 'rbacV1', read: 'readClusterRole', del: 'deleteClusterRole', namespaced: false },
    namespaces: { api: 'coreV1', read: 'readNamespace', del: 'deleteNamespace', namespaced: false },
    nodes: { api: 'coreV1', read: 'readNode', del: null, namespaced: false },
  };

  const DEMO_BY_KIND = {
    pods: mock.PODS, deployments: mock.DEPLOYMENTS, statefulsets: mock.STATEFULSETS,
    daemonsets: mock.DAEMONSETS, jobs: mock.JOBS, cronjobs: mock.CRONJOBS,
    services: mock.SERVICES, ingresses: mock.INGRESSES, configmaps: mock.CONFIGMAPS,
    secrets: mock.SECRETS, pvcs: mock.PVCS, pvs: mock.PVS,
    storageclasses: mock.STORAGECLASSES, hpas: mock.HPAS,
    serviceaccounts: mock.SERVICE_ACCOUNTS, clusterroles: mock.CLUSTER_ROLES,
    namespaces: mock.NAMESPACES, nodes: mock.NODES,
  };

  router.get('/:cluster/resources/:kind/:namespace/:name', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const conn = manager.get(cluster);
    if (conn.isDemo) {
      const item = (DEMO_BY_KIND[kind] || []).find((x) => x.metadata?.name === name && (!x.metadata?.namespace || x.metadata.namespace === namespace));
      if (!item) return res.status(404).json({ error: 'not found' });
      return res.json({ item, isDemo: true });
    }
    const m = KIND_MAP[kind];
    if (!m) return res.status(400).json({ error: `unsupported kind: ${kind}` });
    const api = conn[m.api];
    const r = m.namespaced ? await api[m.read](name, namespace) : await api[m.read](name);
    res.json({ item: r.body, isDemo: false });
  }));

  router.delete('/:cluster/resources/:kind/:namespace/:name', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const conn = manager.get(cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const m = KIND_MAP[kind];
    if (!m || !m.del) return res.status(400).json({ error: `delete unsupported for kind: ${kind}` });
    const api = conn[m.api];
    if (m.namespaced) await api[m.del](name, namespace);
    else await api[m.del](name);
    res.json({ deleted: `${kind}/${namespace}/${name}` });
  }));

  router.get('/:cluster/resources/:kind/:namespace/:name/yaml', asyncHandler(async (req, res) => {
    const { cluster, kind, namespace, name } = req.params;
    const conn = manager.get(cluster);
    let obj;
    if (conn.isDemo) {
      obj = (DEMO_BY_KIND[kind] || []).find((x) => x.metadata?.name === name && (!x.metadata?.namespace || x.metadata.namespace === namespace));
      if (!obj) return res.status(404).json({ error: 'not found' });
    } else {
      const m = KIND_MAP[kind];
      if (!m) return res.status(400).json({ error: `unsupported kind: ${kind}` });
      const api = conn[m.api];
      const r = m.namespaced ? await api[m.read](name, namespace) : await api[m.read](name);
      obj = r.body;
    }
    const clean = JSON.parse(JSON.stringify(obj));
    if (clean.metadata) {
      delete clean.metadata.managedFields;
      delete clean.metadata.resourceVersion;
      delete clean.status;
    }
    res.type('text/yaml').send(yaml.dump(clean, { noRefs: true }));
  }));

  // kubectl-apply style endpoint
  router.post('/:cluster/apply', asyncHandler(async (req, res) => {
    const conn = manager.get(req.params.cluster);
    if (conn.isDemo) return res.status(400).json({ error: 'Read-only in demo cluster' });
    const docs = yaml.loadAll(req.body.yaml || '');
    const results = [];
    const { KubernetesObjectApi } = require('@kubernetes/client-node');
    const objApi = KubernetesObjectApi.makeApiClient(conn.kc);
    for (const doc of docs) {
      if (!doc || !doc.kind) continue;
      try {
        // Try read -> patch, else create
        const plural = doc.kind.toLowerCase() + 's';
        let exists = false;
        try {
          if (doc.metadata?.namespace) {
            await conn.customObjects.getNamespacedCustomObject(doc.apiVersion.split('/')[0] || '', doc.apiVersion.split('/')[1] || doc.apiVersion, doc.metadata.namespace, plural, doc.metadata.name).catch(() => null);
          }
          exists = true;
        } catch { exists = false; }
        void exists;
        const created = await objApi.create(doc).catch(async () => objApi.patch(doc));
        results.push({ kind: doc.kind, name: doc.metadata?.name, status: 'applied', result: created?.body?.metadata?.name || doc.metadata?.name });
      } catch (e) {
        results.push({ kind: doc.kind, name: doc.metadata?.name, status: 'failed', error: e?.body?.message || e.message });
      }
    }
    res.json({ results });
  }));

  // events for a specific object
  router.get('/:cluster/resources/:kind/:namespace/:name/events', asyncHandler(async (req, res) => {
    const { cluster, namespace, name } = req.params;
    const conn = manager.get(cluster);
    if (conn.isDemo) {
      return res.json({ items: mock.EVENTS.filter((e) => !e.metadata.namespace || e.metadata.namespace === namespace), isDemo: true });
    }
    const r = await conn.coreV1.listNamespacedEvent(namespace);
    const items = (r.body.items || []).filter((e) => e.involvedObject?.name === name || e.involvedObject?.name?.startsWith(name.split('-')[0]));
    res.json({ items: items.slice(-100).reverse(), isDemo: false });
  }));

  return router;
}

module.exports = { createApiRouter };
