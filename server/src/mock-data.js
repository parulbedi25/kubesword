'use strict';

/**
 * Realistic demo data so KubeSword is fully explorable without a cluster
 * (used when no kubeconfig is found, or when the `demo` cluster is selected).
 */

function ago(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function meta(name, namespace, minutesOld, labels = {}) {
  return {
    name,
    namespace,
    uid: `demo-${namespace || 'cluster'}-${name}`,
    creationTimestamp: ago(minutesOld),
    labels: { app: name.split('-')[0], ...labels },
  };
}

const NODES = [
  {
    metadata: meta('kubesword-control-1', undefined, 60 * 24 * 14, { 'node-role.kubernetes.io/control-plane': '' }),
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      addresses: [{ type: 'InternalIP', address: '10.0.0.10' }],
      nodeInfo: { kubeletVersion: 'v1.30.2', osImage: 'Ubuntu 22.04 LTS', containerRuntimeVersion: 'containerd://1.7.14', architecture: 'amd64' },
      capacity: { cpu: '8', memory: '32786812Ki', pods: '110' },
      allocatable: { cpu: '8', memory: '31686812Ki', pods: '110' },
    },
    spec: { podCIDR: '10.244.0.0/24' },
  },
  {
    metadata: meta('kubesword-worker-1', undefined, 60 * 24 * 13),
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      addresses: [{ type: 'InternalIP', address: '10.0.0.11' }],
      nodeInfo: { kubeletVersion: 'v1.30.2', osImage: 'Ubuntu 22.04 LTS', containerRuntimeVersion: 'containerd://1.7.14', architecture: 'amd64' },
      capacity: { cpu: '16', memory: '65536812Ki', pods: '110' },
      allocatable: { cpu: '16', memory: '64436812Ki', pods: '110' },
    },
    spec: { podCIDR: '10.244.1.0/24' },
  },
  {
    metadata: meta('kubesword-worker-2', undefined, 60 * 24 * 13),
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      addresses: [{ type: 'InternalIP', address: '10.0.0.12' }],
      nodeInfo: { kubeletVersion: 'v1.30.2', osImage: 'Ubuntu 22.04 LTS', containerRuntimeVersion: 'containerd://1.7.14', architecture: 'amd64' },
      capacity: { cpu: '16', memory: '65536812Ki', pods: '110' },
      allocatable: { cpu: '16', memory: '64436812Ki', pods: '110' },
    },
    spec: { podCIDR: '10.244.2.0/24' },
  },
];

const NAMESPACES = ['default', 'kube-system', 'kube-public', 'monitoring', 'ingress-nginx', 'production', 'staging'].map((n, i) => ({
  metadata: meta(n, undefined, 60 * 24 * 14 - i * 600),
  status: { phase: 'Active' },
}));

function pod(ns, name, node, phase, minutesOld, restarts = 0, containers = ['app']) {
  return {
    metadata: meta(name, ns, minutesOld),
    spec: {
      nodeName: node,
      containers: containers.map((c) => ({ name: c, image: `ghcr.io/demo/${c}:1.4.2` })),
    },
    status: {
      phase,
      podIP: `10.244.${1 + Math.floor(Math.random() * 2)}.${10 + Math.floor(Math.random() * 200)}`,
      startTime: ago(minutesOld - 1),
      containerStatuses: containers.map((c) => ({
        name: c,
        ready: phase === 'Running',
        restartCount: restarts,
        state: phase === 'Running' ? { running: { startedAt: ago(minutesOld - 1) } } : phase === 'Pending' ? { waiting: { reason: 'ContainerCreating' } } : { terminated: { reason: 'Completed', exitCode: 0 } },
      })),
    },
  };
}

const PODS = [
  pod('production', 'checkout-api-7d9f8c6b4d-2x4jk', 'kubesword-worker-1', 'Running', 320, 0, ['api']),
  pod('production', 'checkout-api-7d9f8c6b4d-9plm2', 'kubesword-worker-2', 'Running', 320, 1, ['api']),
  pod('production', 'orders-worker-5b6c7d8e9f-h7kq1', 'kubesword-worker-1', 'Running', 1500, 2, ['worker']),
  pod('production', 'payments-api-6c8d9e0f1a-m3n8p', 'kubesword-worker-2', 'Running', 90, 0, ['api', 'sidecar']),
  pod('staging', 'frontend-9a8b7c6d5e-x1y2z', 'kubesword-worker-1', 'Running', 55, 0, ['web']),
  pod('staging', 'search-indexer-7f6e5d4c3b-q9w8e', 'kubesword-worker-2', 'Pending', 4, 0, ['indexer']),
  pod('monitoring', 'prometheus-0', 'kubesword-worker-1', 'Running', 4300, 0, ['prometheus']),
  pod('monitoring', 'grafana-5d4c3b2a1f-k2j9h', 'kubesword-worker-2', 'Running', 4300, 1, ['grafana']),
  pod('kube-system', 'coredns-7c8d9e0f1a-abc12', 'kubesword-control-1', 'Running', 20000, 3, ['coredns']),
  pod('kube-system', 'etcd-kubesword-control-1', 'kubesword-control-1', 'Running', 20000, 0, ['etcd']),
  pod('ingress-nginx', 'ingress-nginx-controller-8x7w6v5u-zx1cv', 'kubesword-worker-1', 'Running', 8000, 0, ['controller']),
  pod('default', 'crashloop-backoff-demo-abc', 'kubesword-worker-2', 'Running', 65, 14, ['app']),
  pod('default', 'completed-job-pod-xyz', 'kubesword-worker-1', 'Succeeded', 700, 0, ['job']),
];

function workload(kind, ns, name, replicas, available, minutesOld, image = 'ghcr.io/demo/app:1.4.2') {
  return {
    metadata: meta(name, ns, minutesOld),
    spec: { replicas, template: { spec: { containers: [{ name: 'app', image }] } } },
    status: { replicas, availableReplicas: available, readyReplicas: available, updatedReplicas: available },
    kind,
  };
}

const DEPLOYMENTS = [
  workload('Deployment', 'production', 'checkout-api', 3, 3, 320),
  workload('Deployment', 'production', 'orders-worker', 2, 2, 1500),
  workload('Deployment', 'production', 'payments-api', 2, 2, 90),
  workload('Deployment', 'staging', 'frontend', 2, 2, 55),
  workload('Deployment', 'monitoring', 'grafana', 1, 1, 4300),
  workload('Deployment', 'ingress-nginx', 'ingress-nginx-controller', 1, 1, 8000),
  workload('Deployment', 'default', 'crashloop-backoff-demo', 1, 0, 65),
];

const STATEFULSETS = [
  workload('StatefulSet', 'monitoring', 'prometheus', 1, 1, 4300),
  workload('StatefulSet', 'production', 'postgres', 3, 3, 9000),
  workload('StatefulSet', 'production', 'redis', 3, 3, 9000),
];

const DAEMONSETS = [
  workload('DaemonSet', 'kube-system', 'kindnet', 3, 3, 20000),
  workload('DaemonSet', 'kube-system', 'kube-proxy', 3, 3, 20000),
  workload('DaemonSet', 'monitoring', 'node-exporter', 3, 3, 4300),
];

const JOBS = [
  { metadata: meta('db-migration-2891', 'production', 700), status: { succeeded: 1, completionTime: ago(690) }, spec: {} },
  { metadata: meta('report-gen-2892', 'production', 60), status: { active: 1 }, spec: {} },
];

const CRONJOBS = [
  { metadata: meta('db-backup', 'production', 9000), spec: { schedule: '0 2 * * *', jobTemplate: {} }, status: { lastScheduleTime: ago(300) } },
  { metadata: meta('report-gen', 'production', 9000), spec: { schedule: '*/30 * * * *', jobTemplate: {} }, status: { lastScheduleTime: ago(12) } },
];

const SERVICES = [
  { metadata: meta('kubernetes', 'default', 20000), spec: { type: 'ClusterIP', clusterIP: '10.96.0.1', ports: [{ port: 443, targetPort: 6443 }] }, status: {} },
  { metadata: meta('checkout-api', 'production', 320), spec: { type: 'ClusterIP', clusterIP: '10.96.12.40', selector: { app: 'checkout' }, ports: [{ port: 80, targetPort: 8080 }] }, status: {} },
  { metadata: meta('payments-api', 'production', 90), spec: { type: 'ClusterIP', clusterIP: '10.96.12.41', selector: { app: 'payments' }, ports: [{ port: 80, targetPort: 8080 }] }, status: {} },
  { metadata: meta('frontend', 'staging', 55), spec: { type: 'LoadBalancer', clusterIP: '10.96.44.10', selector: { app: 'frontend' }, ports: [{ port: 80, targetPort: 3000 }] }, status: { loadBalancer: { ingress: [{ ip: '203.0.113.42' }] } } },
  { metadata: meta('ingress-nginx-controller', 'ingress-nginx', 8000), spec: { type: 'LoadBalancer', clusterIP: '10.96.60.1', ports: [{ port: 80 }, { port: 443 }] }, status: { loadBalancer: { ingress: [{ ip: '203.0.113.40' }] } } },
  { metadata: meta('prometheus', 'monitoring', 4300), spec: { type: 'ClusterIP', clusterIP: '10.96.70.2', ports: [{ port: 9090 }] }, status: {} },
];

const INGRESSES = [
  {
    metadata: meta('shop', 'production', 300),
    spec: { ingressClassName: 'nginx', rules: [{ host: 'shop.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'checkout-api', port: { number: 80 } } } }] } }] },
    status: { loadBalancer: { ingress: [{ ip: '203.0.113.40' }] } },
  },
  {
    metadata: meta('staging-shop', 'staging', 50),
    spec: { ingressClassName: 'nginx', rules: [{ host: 'staging.shop.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'frontend', port: { number: 80 } } } }] } }] },
    status: { loadBalancer: { ingress: [{ ip: '203.0.113.40' }] } },
  },
];

const CONFIGMAPS = [
  { metadata: meta('shop-config', 'production', 3000), data: { LOG_LEVEL: 'info', REGION: 'ap-south-1', FEATURE_FLAGS: '{"newCheckout":true}' } },
  { metadata: meta('kube-root-ca.crt', 'default', 20000), data: { 'ca.crt': '-----BEGIN CERTIFICATE-----\nMIID...demo...\n-----END CERTIFICATE-----' } },
];

const SECRETS = [
  { metadata: meta('payments-tls', 'production', 2000, {}), type: 'kubernetes.io/tls', data: { 'tls.crt': 'LS0t...', 'tls.key': 'LS0t...' } },
  { metadata: meta('db-credentials', 'production', 9000), type: 'Opaque', data: { username: 'YWRtaW4=', password: 'czNjcjN0' } },
];

const PVCS = [
  { metadata: meta('postgres-data-postgres-0', 'production', 9000), spec: { storageClassName: 'standard', resources: { requests: { storage: '50Gi' } } }, status: { phase: 'Bound', capacity: { storage: '50Gi' } } },
  { metadata: meta('prometheus-data', 'monitoring', 4300), spec: { storageClassName: 'standard', resources: { requests: { storage: '100Gi' } } }, status: { phase: 'Bound', capacity: { storage: '100Gi' } } },
];

const PVS = [
  { metadata: meta('pvc-a1b2c3', undefined, 9000), spec: { storageClassName: 'standard', capacity: { storage: '50Gi' }, claimRef: { namespace: 'production', name: 'postgres-data-postgres-0' } }, status: { phase: 'Bound' } },
  { metadata: meta('pvc-d4e5f6', undefined, 4300), spec: { storageClassName: 'standard', capacity: { storage: '100Gi' }, claimRef: { namespace: 'monitoring', name: 'prometheus-data' } }, status: { phase: 'Bound' } },
];

const STORAGECLASSES = [
  { metadata: meta('standard', undefined, 20000), provisioner: 'kubernetes.io/no-provisioner', reclaimPolicy: 'Delete', volumeBindingMode: 'Immediate' },
  { metadata: meta('fast-ssd', undefined, 10000), provisioner: 'pd.csi.storage.gke.io', reclaimPolicy: 'Delete', volumeBindingMode: 'WaitForFirstConsumer' },
];

const HPAS = [
  { metadata: meta('checkout-api', 'production', 300), spec: { scaleTargetRef: { kind: 'Deployment', name: 'checkout-api' }, minReplicas: 2, maxReplicas: 10, targetCPUUtilizationPercentage: 70 }, status: { currentReplicas: 3, desiredReplicas: 3, currentCPUUtilizationPercentage: 42 } },
];

const EVENTS = [
  { metadata: meta('checkout-api-xyz.1', 'production', 12), reason: 'Scheduled', message: 'Successfully assigned production/checkout-api-7d9f8c6b4d-2x4jk to kubesword-worker-1', type: 'Normal', involvedObject: { kind: 'Pod', name: 'checkout-api-7d9f8c6b4d-2x4jk' }, firstTimestamp: ago(12), lastTimestamp: ago(12), count: 1 },
  { metadata: meta('crash-demo.2', 'default', 6), reason: 'BackOff', message: 'Back-off restarting failed container app in pod crashloop-backoff-demo-abc', type: 'Warning', involvedObject: { kind: 'Pod', name: 'crashloop-backoff-demo-abc' }, firstTimestamp: ago(60), lastTimestamp: ago(6), count: 14 },
  { metadata: meta('node-ready.1', undefined, 1400), reason: 'NodeReady', message: 'Node kubesword-worker-2 status is now: NodeReady', type: 'Normal', involvedObject: { kind: 'Node', name: 'kubesword-worker-2' }, firstTimestamp: ago(1400), lastTimestamp: ago(1400), count: 1 },
];

const SERVICE_ACCOUNTS = [
  { metadata: meta('default', 'production', 9000), secrets: [] },
  { metadata: meta('deployer', 'production', 4000), secrets: [] },
];

const CLUSTER_ROLES = [
  { metadata: meta('cluster-admin', undefined, 20000), rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }] },
  { metadata: meta('view', undefined, 20000), rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['get', 'list', 'watch'] }] },
];

function metricsFor(nodes, pods) {
  return {
    nodes: nodes.map((n, i) => ({
      name: n.metadata.name,
      cpu: { usage: `${800 + i * 350}m`, capacity: n.status.capacity.cpu },
      memory: { usage: `${(4 + i * 3) * 1024}Mi`, capacity: n.status.capacity.memory },
      cpuPercent: 12 + i * 7,
      memoryPercent: 38 + i * 9,
    })),
    pods: pods.slice(0, 8).map((p, i) => ({
      namespace: p.metadata.namespace,
      name: p.metadata.name,
      cpu: `${20 + i * 15}m`,
      memory: `${120 + i * 60}Mi`,
    })),
  };
}

function overview() {
  const running = PODS.filter((p) => p.status.phase === 'Running').length;
  return {
    counts: {
      nodes: NODES.length,
      namespaces: NAMESPACES.length,
      pods: PODS.length,
      deployments: DEPLOYMENTS.length,
      statefulsets: STATEFULSETS.length,
      daemonsets: DAEMONSETS.length,
      jobs: JOBS.length,
      cronjobs: CRONJOBS.length,
      services: SERVICES.length,
      ingresses: INGRESSES.length,
      configmaps: CONFIGMAPS.length,
      secrets: SECRETS.length,
      pvcs: PVCS.length,
      pvs: PVS.length,
      hpas: HPAS.length,
    },
    podsByPhase: {
      Running: running,
      Pending: PODS.filter((p) => p.status.phase === 'Pending').length,
      Succeeded: PODS.filter((p) => p.status.phase === 'Succeeded').length,
      Failed: PODS.filter((p) => p.status.phase === 'Failed').length,
    },
    warnings: EVENTS.filter((e) => e.type === 'Warning').length,
    restarts: PODS.reduce((a, p) => a + (p.status.containerStatuses || []).reduce((x, c) => x + (c.restartCount || 0), 0), 0),
  };
}

const DEMO_LOGS = `[2026-10-25T10:00:01Z] INFO  Starting checkout-api v1.4.2 (commit 9f3ac21)
[2026-10-25T10:00:02Z] INFO  Connected to postgres://postgres-0:5432/shop in 41ms
[2026-10-25T10:00:02Z] INFO  Connected to redis://redis-0:6379 in 9ms
[2026-10-25T10:00:03Z] INFO  Listening on :8080, metrics on :9090
[2026-10-25T10:00:14Z] INFO  GET /healthz 200 2ms
[2026-10-25T10:01:02Z] INFO  POST /api/checkout 201 84ms order_id=ord_88213 amount=₹1,299.00
[2026-10-25T10:01:47Z] WARN  Slow query detected on orders table (412ms) trace_id=7d21bc
[2026-10-25T10:02:31Z] INFO  POST /api/checkout 201 77ms order_id=ord_88214 amount=₹499.00
[2026-10-25T10:03:05Z] INFO  GET /metrics 200 4ms
[2026-10-25T10:04:19Z] ERROR payment gateway timeout (attempt 1/3) order_id=ord_88215
[2026-10-25T10:04:22Z] INFO  payment retry succeeded order_id=ord_88215 attempt=2
[2026-10-25T10:05:00Z] INFO  Cache hit ratio 0.94 (last 5m)
`;

module.exports = {
  NODES,
  NAMESPACES,
  PODS,
  DEPLOYMENTS,
  STATEFULSETS,
  DAEMONSETS,
  JOBS,
  CRONJOBS,
  SERVICES,
  INGRESSES,
  CONFIGMAPS,
  SECRETS,
  PVCS,
  PVS,
  STORAGECLASSES,
  HPAS,
  EVENTS,
  SERVICE_ACCOUNTS,
  CLUSTER_ROLES,
  DEMO_LOGS,
  metricsFor,
  overview,
};
