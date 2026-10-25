'use strict';

/**
 * Multi-cluster Kubernetes client manager.
 * - Loads default kubeconfig (~/.kube/config, $KUBECONFIG), in-cluster config,
 *   plus user-uploaded kubeconfigs persisted under the data directory.
 * - Always exposes a `demo` cluster with mock data so the UI is explorable.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const k8s = require('@kubernetes/client-node');
const yaml = require('js-yaml');
const mock = require('./mock-data');

const DATA_DIR = process.env.KUBESWORD_DATA || path.join(os.homedir(), '.kubesword');
const CUSTOM_DIR = path.join(DATA_DIR, 'kubeconfigs');

function ensureDirs() {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

class ClusterConnection {
  constructor(name, kubeconfig, isDemo = false) {
    this.name = name;
    this.kc = kubeconfig;
    this.isDemo = isDemo;
    if (!isDemo && kubeconfig) {
      this.coreV1 = kubeconfig.makeApiClient(k8s.CoreV1Api);
      this.appsV1 = kubeconfig.makeApiClient(k8s.AppsV1Api);
      this.batchV1 = kubeconfig.makeApiClient(k8s.BatchV1Api);
      this.networkingV1 = kubeconfig.makeApiClient(k8s.NetworkingV1Api);
      this.storageV1 = kubeconfig.makeApiClient(k8s.StorageV1Api);
      this.rbacV1 = kubeconfig.makeApiClient(k8s.RbacAuthorizationV1Api);
      this.autoscalingV2 = kubeconfig.makeApiClient(k8s.AutoscalingV2Api);
      this.customObjects = kubeconfig.makeApiClient(k8s.CustomObjectsApi);
      this.versionApi = kubeconfig.makeApiClient(k8s.VersionApi);
      this.exec = new k8s.Exec(kubeconfig);
      this.log = new k8s.Log(kubeconfig);
      this.portForward = new k8s.PortForward(kubeconfig);
      this.watch = new k8s.Watch(kubeconfig);
    }
  }
}

class K8sManager {
  constructor() {
    this.clusters = new Map(); // name -> ClusterConnection
    this.currentContext = null;
    ensureDirs();
    this.reload();
  }

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

  isDemo(name) {
    try {
      return this.get(name).isDemo;
    } catch {
      return false;
    }
  }

  switchCluster(name) {
    if (!this.clusters.has(name)) {
      const err = new Error(`Unknown cluster: ${name}`);
      err.statusCode = 404;
      throw err;
    }
    this.currentContext = name;
    return { current: name };
  }

  reload() {
    this.clusters.clear();
    // 1. Default kubeconfig contexts (each context = one cluster entry)
    try {
      const kc = new k8s.KubeConfig();
      let loaded = false;
      if (process.env.KUBECONFIG && fs.existsSync(process.env.KUBECONFIG)) {
        kc.loadFromFile(process.env.KUBECONFIG);
        loaded = true;
      } else {
        const def = path.join(os.homedir(), '.kube', 'config');
        if (fs.existsSync(def)) {
          kc.loadFromDefault();
          loaded = true;
        } else {
          try {
            kc.loadFromClusterAndUser({ name: 'in-cluster', server: '', skipTLSVerify: false }, { name: 'in-cluster-user' });
            // Only counts if serviceaccount token exists (running inside k8s)
            if (fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token')) {
              kc.loadFromDefault();
              loaded = true;
            }
          } catch { /* not in cluster */ }
        }
      }
      if (loaded) {
        for (const ctx of kc.getContexts()) {
          const single = new k8s.KubeConfig();
          // Clone full config but pin current context
          single.loadFromString(JSON.stringify(kcToJSON(kc)));
          single.setCurrentContext(ctx.name);
          this.clusters.set(ctx.name, new ClusterConnection(ctx.name, single));
        }
        if (!this.currentContext && kc.currentContext && this.clusters.has(kc.currentContext)) {
          this.currentContext = kc.currentContext;
        }
      }
    } catch (e) {
      console.warn('[kubesword] default kubeconfig load failed:', e.message);
    }

    // 2. Uploaded kubeconfigs (each file may expose multiple contexts)
    try {
      for (const file of fs.readdirSync(CUSTOM_DIR)) {
        if (!file.endsWith('.kubeconfig') && !file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        const label = path.basename(file).replace(/\.(kubeconfig|yaml|yml)$/, '');
        try {
          const content = fs.readFileSync(path.join(CUSTOM_DIR, file), 'utf8');
          const kc = new k8s.KubeConfig();
          kc.loadFromString(content);
          for (const ctx of kc.getContexts()) {
            const key = kc.getContexts().length > 1 ? `${label}/${ctx.name}` : label;
            const single = new k8s.KubeConfig();
            single.loadFromString(content);
            single.setCurrentContext(ctx.name);
            this.clusters.set(key, new ClusterConnection(key, single));
          }
        } catch (e) {
          console.warn(`[kubesword] failed to load uploaded kubeconfig ${file}:`, e.message);
        }
      }
    } catch (e) {
      console.warn('[kubesword] custom kubeconfig scan failed:', e.message);
    }

    // 3. Always offer demo cluster
    this.clusters.set('demo', new ClusterConnection('demo', null, true));
    if (!this.currentContext || !this.clusters.has(this.currentContext)) {
      // Prefer a real cluster, else demo
      const real = [...this.clusters.keys()].find((k) => k !== 'demo');
      this.currentContext = real || 'demo';
    }
    console.log(`[kubesword] clusters: ${[...this.clusters.keys()].join(', ')} (current=${this.currentContext})`);
  }

  addKubeconfig(name, kubeconfigYaml) {
    const label = safeName(name || `cluster-${Date.now()}`);
    // Validate by parsing
    const parsed = yaml.load(kubeconfigYaml);
    if (!parsed || parsed.kind !== 'Config' || !parsed.clusters) {
      const err = new Error('Invalid kubeconfig: expected a Kubernetes Config document');
      err.statusCode = 400;
      throw err;
    }
    ensureDirs();
    fs.writeFileSync(path.join(CUSTOM_DIR, `${label}.kubeconfig`), kubeconfigYaml, { mode: 0o600 });
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
    // Also handle prefixed contexts (label/ctx)
    this.reload();
    return { removed: name, clusters: this.listClusters() };
  }
}

function kcToJSON(kc) {
  // Serialize current in-memory kubeconfig back to a plain object
  const out = { apiVersion: 'v1', kind: 'Config', clusters: [], users: [], contexts: [], 'current-context': kc.currentContext };
  for (const c of kc.getClusters()) out.clusters.push({ name: c.name, cluster: { server: c.server, 'certificate-authority-data': c.caData, insecureSkipTLSVerify: c.skipTLSVerify } });
  for (const u of kc.getUsers()) out.users.push({ name: u.name, user: { token: u.token, username: u.username, password: u.password, 'client-certificate-data': u.certData, 'client-key-data': u.keyData, exec: u.exec, authProvider: u.authProvider } });
  for (const c of kc.getContexts()) out.contexts.push({ name: c.name, context: { cluster: c.cluster, user: c.user, namespace: c.namespace } });
  return out;
}

module.exports = { K8sManager, mock };
