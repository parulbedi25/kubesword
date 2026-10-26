export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Plain fetch() hangs forever on black-holed connections; cap every call.
const REQUEST_TIMEOUT_MS = 30000;

async function request(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError(0, 'Request timed out — is the server still running?');
    throw new ApiError(0, e?.message || 'Network error — is the server still running?');
  } finally {
    clearTimeout(timer);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/')) return (await res.text()) as unknown as T;
  return res.json() as Promise<T>;
}

const json = { 'Content-Type': 'application/json' };

export const api = {
  get: <T>(url: string) => request(url).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: any) =>
    request(url, { method: 'POST', headers: json, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  put: <T>(url: string, body?: any) =>
    request(url, { method: 'PUT', headers: json, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  del: <T>(url: string) => request(url, { method: 'DELETE' }).then((r) => handle<T>(r)),
};

export interface ClusterInfo {
  name: string;
  isDemo: boolean;
  current: boolean;
  server: string;
}

const enc = encodeURIComponent;

export const k8s = {
  clusters: () => api.get<{ current: string; clusters: ClusterInfo[] }>('/api/clusters'),
  switchCluster: (context: string) => api.post<{ current: string }>('/api/clusters/switch', { context }),
  reloadClusters: () => api.post<{ current: string; clusters: ClusterInfo[] }>('/api/clusters/reload'),
  addCluster: (name: string, kubeconfig: string) => api.post('/api/clusters', { name, kubeconfig }),
  deleteCluster: (name: string) => api.del(`/api/clusters/${enc(name)}`),
  info: (c: string) => api.get<any>(`/api/${enc(c)}/info`),
  overview: (c: string) => api.get<any>(`/api/${enc(c)}/overview`),
  list: (c: string, kind: string, namespace = 'all') =>
    api.get<{ items: any[]; isDemo?: boolean }>(`/api/${enc(c)}/${kind}?namespace=${enc(namespace)}`),
  get: (c: string, kind: string, ns: string, name: string) =>
    api.get<{ item: any; isDemo?: boolean }>(`/api/${enc(c)}/resources/${kind}/${enc(ns)}/${enc(name)}`),
  remove: (c: string, kind: string, ns: string, name: string) =>
    api.del(`/api/${enc(c)}/resources/${kind}/${enc(ns)}/${enc(name)}`),
  yaml: (c: string, kind: string, ns: string, name: string) =>
    api.get<string>(`/api/${enc(c)}/resources/${kind}/${enc(ns)}/${enc(name)}/yaml`),
  apply: (c: string, yamlText: string) => api.post<{ results: any[] }>(`/api/${enc(c)}/apply`, { yaml: yamlText }),
  eventsFor: (c: string, kind: string, ns: string, name: string) =>
    api.get<{ items: any[] }>(`/api/${enc(c)}/resources/${kind}/${enc(ns)}/${enc(name)}/events`),
  restartDeployment: (c: string, ns: string, name: string) =>
    api.post(`/api/${enc(c)}/deployments/${enc(ns)}/${enc(name)}/restart`),
  scaleDeployment: (c: string, ns: string, name: string, replicas: number) =>
    api.put(`/api/${enc(c)}/deployments/${enc(ns)}/${enc(name)}/scale`, { replicas }),
  scaleStatefulSet: (c: string, ns: string, name: string, replicas: number) =>
    api.put(`/api/${enc(c)}/statefulsets/${enc(ns)}/${enc(name)}/scale`, { replicas }),
  nodeMetrics: (c: string) => api.get<any>(`/api/${enc(c)}/metrics/nodes`),
  podLogs: (c: string, ns: string, name: string, container?: string, tailLines = 500) =>
    api.get<string>(
      `/api/${enc(c)}/pods/${enc(ns)}/${enc(name)}/logs?tailLines=${tailLines}${container ? `&container=${enc(container)}` : ''}`,
    ),
  createNamespace: (c: string, name: string) => api.post(`/api/${enc(c)}/namespaces`, { name }),
  portForwards: (c: string) => api.get<{ items: any[] }>(`/api/${enc(c)}/portforward`),
  startPortForward: (c: string, body: { namespace: string; pod: string; podPort: number; localPort?: number }) =>
    api.post<{ item: any }>(`/api/${enc(c)}/portforward`, body),
  stopPortForward: (c: string, id: string) => api.del(`/api/${enc(c)}/portforward/${id}`),
};
