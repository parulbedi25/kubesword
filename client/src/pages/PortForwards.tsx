import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, Square } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { Loading, ErrorBox, EmptyState, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';

export function PortForwards() {
  const { current, namespace } = useCluster();
  const qc = useQueryClient();
  const [ns, setNs] = useState('');
  const [pod, setPod] = useState('');
  const [podPort, setPodPort] = useState('');
  const [localPort, setLocalPort] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['portforwards', current],
    queryFn: () => k8s.portForwards(current),
    refetchInterval: 10000,
  });

  const { data: podsData } = useQuery({
    queryKey: ['pods', current, namespace],
    queryFn: () => k8s.list(current, 'pods', namespace),
    refetchInterval: 15000,
  });
  const pods = Array.isArray(podsData?.items) ? podsData.items : [];
  const running = pods.filter((p: any) => p.status?.phase === 'Running');
  const selected = running.find((p: any) => p.metadata?.name === pod);
  const podPorts: number[] = selected
    ? [...new Set<number>((selected.spec?.containers || []).flatMap((c: any) => (c.ports || []).map((x: any) => x.containerPort as number)))]
    : [];

  if (isLoading) return <Loading label="Loading port forwards…" />;
  if (loadError) return <ErrorBox error={loadError} onRetry={() => refetch()} />;
  const items = Array.isArray(data?.items) ? data.items : [];

  const start = async () => {
    const nsName = namespace === 'all' ? ns : namespace;
    const pp = Number(podPort);
    if (!nsName || !pod || !Number.isInteger(pp) || pp < 1 || pp > 65535) {
      setError('Pick a namespace, a pod, and a valid pod port (1–65535).');
      return;
    }
    const lp = localPort.trim() === '' ? undefined : Number(localPort);
    if (lp !== undefined && (!Number.isInteger(lp) || lp < 1 || lp > 65535)) {
      setError('Local port must be 1–65535 (or blank for auto-assign).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await k8s.startPortForward(current, { namespace: nsName, pod, podPort: pp, localPort: lp });
      setPod('');
      setPodPort('');
      setLocalPort('');
      qc.invalidateQueries({ queryKey: ['portforwards'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    try {
      await k8s.stopPortForward(current, id);
      qc.invalidateQueries({ queryKey: ['portforwards'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Port forwards</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Expose a pod port on your machine — forwards run inside the KubeSword server.
          </p>
        </div>
        <NamespaceFilter />
      </div>

      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-3">New port forward</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {namespace === 'all' && (
            <select className="ks-input" value={ns} onChange={(e) => { setNs(e.target.value); setPod(''); }}>
              <option value="">Namespace…</option>
              {[...new Set(running.map((p: any) => p.metadata?.namespace))].sort().map((n: string) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
          <select className="ks-input lg:col-span-2" value={pod} onChange={(e) => { setPod(e.target.value); setPodPort(''); }}>
            <option value="">Pod…</option>
            {running
              .filter((p: any) => namespace !== 'all' || !ns || p.metadata?.namespace === ns)
              .map((p: any) => (
                <option key={p.metadata.uid} value={p.metadata.name}>
                  {namespace === 'all' ? `${p.metadata.namespace}/${p.metadata.name}` : p.metadata.name}
                </option>
              ))}
          </select>
          {podPorts.length > 0 ? (
            <select className="ks-input" value={podPort} onChange={(e) => setPodPort(e.target.value)}>
              <option value="">Pod port…</option>
              {podPorts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <input className="ks-input" value={podPort} onChange={(e) => setPodPort(e.target.value)} placeholder="Pod port" inputMode="numeric" />
          )}
          <input className="ks-input" value={localPort} onChange={(e) => setLocalPort(e.target.value)} placeholder="Local port (auto)" inputMode="numeric" />
        </div>
        {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
        <button onClick={start} disabled={busy} className="ks-btn-primary mt-3 disabled:opacity-60">
          <Plug className="w-4 h-4" /> {busy ? 'Starting…' : 'Start forwarding'}
        </button>
      </div>

      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-3">Active ({items.length})</h2>
        {items.length === 0 ? (
          <EmptyState title="No active port forwards" hint="Start one above to access a pod locally." />
        ) : (
          <div className="space-y-2">
            {items.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-base-700/60 bg-base-800/40 p-3 flex-wrap">
                <Badge tone="green">active</Badge>
                <span className="font-mono text-[13px] text-slate-200">
                  localhost:{f.localPort} <span className="text-slate-500">→</span> {f.namespace}/{f.pod}:{f.podPort}
                </span>
                <span className="flex-1" />
                <a
                  className="ks-btn-ghost !py-1.5 !text-xs"
                  href={`http://localhost:${f.localPort}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                <button onClick={() => stop(f.id)} className="ks-btn-ghost !py-1.5 !text-xs !text-red-300">
                  <Square className="w-3.5 h-3.5" /> Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
