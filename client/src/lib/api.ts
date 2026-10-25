export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch { /* keep default */ }
    throw new ApiError(res.status, msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/')) return (await res.text()) as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(url: string) => fetch(url).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: any) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  put: <T>(url: string, body?: any) =>
    fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  del: <T>(url: string) => fetch(url, { method: 'DELETE' }).then((r) => handle<T>(r)),
};

export interface ClusterInfo {
  name: string;
  isDemo: boolean;
  current: boolean;
  server: string;
}

export const k8s = {
  clusters: () => api.get<{ current: string; clusters: ClusterInfo[] }>('/api/clusters'),
  switchCluster: (context: string) => api.post<{ current: string }>('/api/clusters/switch', { context }),
  reloadClusters: () => api.post<{ current: string; clusters: ClusterInfo[] }>('/api/clusters/reload'),
  addCluster: (name: string, kubeconfig: string) => api.post('/api/clusters', { name, kubeconfig }),
  deleteCluster: (name: string) => api.del(`/api/clusters/${encodeURIComponent(name)}`),
  info: (c: string) => api.get<any>(`/api/${encodeURIComponent(c)}/info`),
  overview: (c: string) => api.get<any>(`/api/${encodeURIComponent(c)}/overview`),
  list: (c: string, kind: string, namespace = 'all') =>
    api.get<{ items: any[]; isDemo?: boolean }>(`/api/${encodeURIComponent(c)}/${kind}?namespace=${encodeURIComponent(namespace)}`),
  get: (c: string, kind: string, ns: string, name: string) =>
    api.get<{ item: any; isDemo?: boolean }>(`/api/${encodeURIComponent(c)}/resources/${kind}/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`),
  remove: (c: string, kind: string, ns: string, name: string) =>
    api.del(`/api/${encodeURIComponent(c)}/resources/${kind}/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`),
  yaml: (c: string, kind: string, ns: string, name: string) =>
    api.get<string>(`/api/${encodeURIComponent(c)}/resources/${kind}/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/yaml`),
  apply: (c: string, yamlText: string) => api.post<{ results: any[] }>(`/api/${encodeURIComponent(c)}/apply`, { yaml: yamlText }),
  eventsFor: (c: string, kind: string, ns: string, name: string) =>
    api.get<{ items: any[] }>(`/api/${encodeURIComponent(c)}/resources/${kind}/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/events`),
  restartDeployment: (c: string, ns: string, name: string) =>
    api.post(`/api/${encodeURIComponent(c)}/deployments/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/restart`),
  scaleDeployment: (c: string, ns: string, name: string, replicas: number) =>
    api.put(`/api/${encodeURIComponent(c)}/deployments/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/scale`, { replicas }),
  scaleStatefulSet: (c: string, ns: string, name: string, replicas: number) =>
    api.put(`/api/${encodeURIComponent(c)}/statefulsets/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/scale`, { replicas }),
  nodeMetrics: (c: string) => api.get<any>(`/api/${encodeURIComponent(c)}/metrics/nodes`),
  podMetrics: (c: string, ns = 'all') => api.get<any>(`/api/${encodeURIComponent(c)}/metrics/pods?namespace=${encodeURIComponent(ns)}`),
  podLogs: (c: string, ns: string, name: string, container?: string, tailLines = 500) =>
    api.get<string>(`/api/${encodeURIComponent(c)}/pods/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/logs?tailLines=${tailLines}${container ? `&container=${encodeURIComponent(container)}` : ''}`),
  createNamespace: (c: string, name: string) => api.post(`/api/${encodeURIComponent(c)}/namespaces`, { name }),
  portForwards: (c: string) => api.get<{ items: any[] }>(`/api/${encodeURIComponent(c)}/portforward`),
  startPortForward: (c: string, body: { namespace: string; pod: string; podPort: number; localPort?: number }) =>
    api.post<{ item: any }>(`/api/${encodeURIComponent(c)}/portforward`, body),
  stopPortForward: (c: string, id: string) => api.del(`/api/${encodeURIComponent(c)}/portforward/${id}`),
};
