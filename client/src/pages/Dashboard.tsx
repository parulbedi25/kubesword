import { useQuery } from '@tanstack/react-query';
import { Server, Boxes, Layers, AlertTriangle, FolderOpen } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, StatCard, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { PodPhasePie, Legend, BarList } from '../components/DashboardCharts';

export function Dashboard() {
  const { current, namespace } = useCluster();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['overview', current],
    queryFn: () => k8s.overview(current),
    refetchInterval: 15000,
  });

  const { data: nodeMetrics } = useQuery({
    queryKey: ['node-metrics', current],
    queryFn: () => k8s.nodeMetrics(current).catch(() => null),
    refetchInterval: 30000,
    retry: false,
  });

  if (isLoading) return <Loading label="Loading cluster overview…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;

  const counts = data?.counts || {};
  const pods = Array.isArray(data?.podPhases) ? data.podPhases : [];
  const byNs = Array.isArray(data?.podsByNamespace) ? data.podsByNamespace : [];
  const events = Array.isArray(data?.recentEvents) ? data.recentEvents : [];
  const metrics: any[] = Array.isArray(nodeMetrics?.items) ? nodeMetrics.items : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Cluster overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.version ? `Kubernetes ${data.version} · ` : ''}
            {counts.namespaces ?? 0} namespaces · {counts.pods ?? 0} pods
          </p>
        </div>
        <NamespaceFilter />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Nodes" value={counts.nodes ?? 0} icon={<Server className="w-5 h-5" />} />
        <StatCard label="Pods" value={counts.pods ?? 0} icon={<Boxes className="w-5 h-5" />} />
        <StatCard label="Deployments" value={counts.deployments ?? 0} icon={<Layers className="w-5 h-5" />} />
        <StatCard label="Namespaces" value={counts.namespaces ?? 0} icon={<FolderOpen className="w-5 h-5" />} />
        <StatCard
          label="Warnings (24h)"
          value={events.filter((e: any) => e.type === 'Warning').length}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-amber-400"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-1">Pods by phase{namespace !== 'all' ? ` (namespace: ${namespace})` : ''}</h2>
          <PodPhasePie data={namespace === 'all' ? pods : podsForNamespace(data, namespace)} />
          <Legend data={namespace === 'all' ? pods : podsForNamespace(data, namespace)} />
        </div>
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-2">Pods by namespace</h2>
          <BarList data={byNs} />
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-2">Node usage</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics.map((m: any) => (
              <div key={m.name} className="rounded-lg border border-base-700/60 bg-base-800/40 p-3">
                <p className="font-mono text-[13px] text-slate-200 truncate">{m.name}</p>
                <UsageBar label="CPU" pct={m.cpuPct} text={`${m.cpu || '?'} (${m.cpuPct ?? '?'}%)`} />
                <UsageBar label="Mem" pct={m.memPct} text={`${m.mem || '?'} (${m.memPct ?? '?'}%)`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-2">Recent events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No recent events.</p>
        ) : (
          <div className="space-y-1.5">
            {events.slice(0, 8).map((e: any, i: number) => (
              <div key={e.metadata?.uid || i} className="flex items-center gap-3 text-sm">
                <Badge tone={e.type === 'Warning' ? 'yellow' : 'blue'}>{e.reason || e.type}</Badge>
                <span className="flex-1 min-w-0 truncate text-slate-300">{e.message}</span>
                <span className="text-xs text-slate-500 shrink-0">{timeAgo(e.lastTimestamp || e.eventTime)} ago</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function podsForNamespace(data: any, ns: string) {
  const all = Array.isArray(data?.podsByPhaseAndNs) ? data.podsByPhaseAndNs : [];
  const agg: Record<string, number> = {};
  for (const r of all) {
    if (r.namespace === ns) agg[r.phase] = (agg[r.phase] || 0) + r.value;
  }
  return Object.entries(agg).map(([name, value]) => ({ name, value }));
}

function UsageBar({ label, pct, text }: { label: string; pct?: number; text: string }) {
  const p = typeof pct === 'number' ? Math.min(100, Math.max(0, pct)) : 0;
  const color = p > 85 ? 'bg-red-500' : p > 65 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="font-mono">{text}</span>
      </div>
      <div className="h-1.5 rounded-full bg-base-700 mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}
