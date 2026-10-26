'use strict';

/**
 * Multi-cluster Kubernetes client manager.
 *
 * Cluster sources (in order):
 *  1. Default kubeconfig — $KUBECONFIG or ~/.kube/config, one entry per context.
 *  2. Uploaded kubeconfigs persisted under <data-dir>/kubeconfigs/.
 *  3. Always a `demo` cluster with mock data so the UI is explorable offline.
 *
 * Data dir: $KUBESWORD_DATA, else ~/.kubesword (portable desktop builds point
 * it next to the executable).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const k8s = require('@kubernetes/client-node');
const yaml = require('js-yaml');

const DATA_DIR = process.env.KUBESWORD_DATA || path.join(os.homedir(), '.kubesword');
const CUSTOM_DIR = path.join(DATA_DIR, 'kubeconfigs');

const safeName = (name) =>
  String(name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);

class ClusterConnection {
  constructor(name, kc, isDemo = false) {
    this.name = name;
    this.kc = kc;
    this.isDemo = isDemo;
    if (isDemo || !kc) return;
    this.coreV1 = kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1 = kc.makeApiClient(k8s.AppsV1Api);
    this.batchV1 = kc.makeApiClient(k8s.BatchV1Api);
    this.networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api);
    this.storageV1 = kc.makeApiClient(k8s.StorageV1Api);
    this.rbacV1 = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
    this.autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api);
    this.customObjects = kc.makeApiClient(k8s.CustomObjectsApi);
    this.versionApi = kc.makeApiClient(k8s.VersionApi);
    this.exec = new k8s.Exec(kc);
    this.log = new k8s.Log(kc);
    this.portForward = new k8s.PortForward(kc);
    this.watch = new k8s.Watch(kc);
  }
}

class K8sManager {
  constructor() {
    this.clusters = new Map(); // name -> ClusterConnection
    this.currentContext = null;
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    this.reload();
  }

  // ---------------- queries ----------------

  listClusters() {
    return [...this.clusters.entries()].map(([name, conn]) => ({
      name,
      isDemo: !!conn.isDemo,
      current: name === this.currentContext,
      server: this.serverOf(conn),
    }));
  }

  serverOf(conn) {
    try {
      if (conn.isDemo) return 'demo://kubesword.local';
      const cluster = conn.kc.getCurrentCluster();
      return cluster ? cluster.server : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  get(name) {
    const key = name || this.currentContext;
    const conn = this.clusters.get(key);
    if (!conn) {
      const err = new Error(`Unknown cluster: ${key}`);
      err.statusCode = 404;
      throw err;
    }
    return conn;
  }

  switchCluster(name) {
    if (!name || !this.clusters.has(name)) {
      const err = new Error(`Unknown cluster: ${name}`);
      err.statusCode = 404;
      throw err;
    }
    this.currentContext = name;
    return { current: name };
  }

  // ---------------- loading ----------------

  reload() {
    this.clusters.clear();
    this.loadDefaultKubeconfig();
    this.loadUploadedKubeconfigs();

    // Always offer the demo cluster.
    this.clusters.set('demo', new ClusterConnection('demo', null, true));
    if (!this.currentContext || !this.clusters.has(this.currentContext)) {
      const real = [...this.clusters.keys()].find((k) => k !== 'demo');
      this.currentContext = real || 'demo';
    }
    console.log(`[kubesword] clusters: ${[...this.clusters.keys()].join(', ')} (current=${this.currentContext})`);
  }

  loadDefaultKubeconfig() {
    try {
      const kc = new k8s.KubeConfig();
      const fromEnv = process.env.KUBECONFIG && fs.existsSync(process.env.KUBECONFIG);
      const defaultPath = path.join(os.homedir(), '.kube', 'config');
      if (fromEnv) kc.loadFromFile(process.env.KUBECONFIG);
      else if (fs.existsSync(defaultPath)) kc.loadFromFile(defaultPath);
      else if (fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token')) kc.loadFromCluster();
      else return; // no kubeconfig anywhere — demo mode only

      this.addContexts(kc, (ctx) => ctx.name);
      if (!this.currentContext && kc.currentContext && this.clusters.has(kc.currentContext)) {
        this.currentContext = kc.currentContext;
      }
    } catch (e) {
      console.warn('[kubesword] default kubeconfig load failed:', e.message);
    }
  }

  loadUploadedKubeconfigs() {
    let files;
    try {
      files = fs.readdirSync(CUSTOM_DIR);
    } catch (e) {
      console.warn('[kubesword] custom kubeconfig scan failed:', e.message);
      return;
    }
    for (const file of files) {
      if (!/\.(kubeconfig|ya?ml)$/.test(file)) continue;
      const label = path.basename(file).replace(/\.(kubeconfig|ya?ml)$/, '');
      try {
        const content = fs.readFileSync(path.join(CUSTOM_DIR, file), 'utf8');
        const kc = new k8s.KubeConfig();
        kc.loadFromString(content);
        const multi = kc.getContexts().length > 1;
        this.addContexts(kc, (ctx) => (multi ? `${label}/${ctx.name}` : label), content);
      } catch (e) {
        console.warn(`[kubesword] failed to load uploaded kubeconfig ${file}:`, e.message);
      }
    }
  }

  // Register one ClusterConnection per context, each pinned to its context.
  addContexts(kc, keyFn, rawContent) {
    for (const ctx of kc.getContexts()) {
      try {
        const single = new k8s.KubeConfig();
        if (rawContent) single.loadFromString(rawContent);
        else single.loadFromString(JSON.stringify(kcToJSON(kc)));
        single.setCurrentContext(ctx.name);
        const key = keyFn(ctx);
        this.clusters.set(key, new ClusterConnection(key, single));
      } catch (e) {
        console.warn(`[kubesword] skipping context ${ctx.name}:`, e.message);
      }
    }
  }

  // ---------------- mutations ----------------

  addKubeconfig(name, kubeconfigYaml) {
    const label = safeName(name || `cluster-${Date.now()}`);
    if (!label) {
      const err = new Error('Invalid cluster name');
      err.statusCode = 400;
      throw err;
    }
    let parsed;
    try {
      parsed = yaml.load(String(kubeconfigYaml));
    } catch (e) {
      const err = new Error(`Invalid kubeconfig YAML: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
    if (!parsed || parsed.kind !== 'Config' || !Array.isArray(parsed.clusters) || !parsed.clusters.length) {
      const err = new Error('Invalid kubeconfig: expected a Kubernetes Config document with at least one cluster');
      err.statusCode = 400;
      throw err;
    }
    // Validate that the k8s client can actually load it (bad cert data etc.).
    try {
      const probe = new k8s.KubeConfig();
      probe.loadFromString(String(kubeconfigYaml));
      if (!probe.getContexts().length) throw new Error('no contexts found');
    } catch (e) {
      const err = new Error(`Kubeconfig rejected: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    fs.writeFileSync(path.join(CUSTOM_DIR, `${label}.kubeconfig`), String(kubeconfigYaml), { mode: 0o600 });
    this.reload();
    return { added: label, clusters: this.listClusters() };
  }

  removeCluster(name) {
    if (name === 'demo') {
      const err = new Error('Cannot delete the demo cluster');
      err.statusCode = 400;
      throw err;
    }
    const file = path.join(CUSTOM_DIR, `${safeName(name)}.kubeconfig`);
    if (fs.existsSync(file)) fs.rmSync(file);
    // Multi-context uploads register as "label/context" — find the parent file.
    if (name.includes('/')) {
      const parent = path.join(CUSTOM_DIR, `${safeName(name.split('/')[0])}.kubeconfig`);
      if (fs.existsSync(parent)) fs.rmSync(parent);
    }
    this.reload();
    return { removed: name, clusters: this.listClusters() };
  }
}

// Serialize an in-memory KubeConfig back to a plain object (used to fan out
// one connection per context from the default kubeconfig).
function kcToJSON(kc) {
  const out = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [],
    users: [],
    contexts: [],
    'current-context': kc.currentContext,
  };
  for (const c of kc.getClusters()) {
    out.clusters.push({
      name: c.name,
      cluster: {
        server: c.server,
        'certificate-authority-data': c.caData,
        'certificate-authority': c.caFile,
        insecureSkipTLSVerify: c.skipTLSVerify,
      },
    });
  }
  for (const u of kc.getUsers()) {
    out.users.push({
      name: u.name,
      user: {
        token: u.token,
        username: u.username,
        password: u.password,
        'client-certificate-data': u.certData,
        'client-certificate': u.certFile,
        'client-key-data': u.keyData,
        'client-key': u.keyFile,
        exec: u.exec,
        authProvider: u.authProvider,
      },
    });
  }
  for (const c of kc.getContexts()) {
    out.contexts.push({ name: c.name, context: { cluster: c.cluster, user: c.user, namespace: c.namespace } });
  }
  return out;
}

module.exports = { K8sManager, ClusterConnection, DATA_DIR, CUSTOM_DIR };
