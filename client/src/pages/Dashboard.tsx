import React, { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Box, Layers, Network, AlertTriangle, RotateCcw, Cpu, MemoryStick } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo, toneClasses, cn } from '../lib/utils';
import { Loading, ErrorBox, StatCard, Badge } from '../components/ui';

const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

export function Dashboard() {
  const { current } = useCluster();
  const overview = useQuery({ queryKey: ['overview', current], queryFn: () => k8s.overview(current), refetchInterval: 10000 });
  const nodes = useQuery({ queryKey: ['list', current, 'nodes', 'all'], queryFn: () => k8s.list(current, 'nodes', 'all'), refetchInterval: 15000 });
  const events = useQuery({ queryKey: ['list', current, 'events', 'all'], queryFn: () => k8s.list(current, 'events', 'all'), refetchInterval: 10000 });
  const nodeMetrics = useQuery({ queryKey: ['nodeMetrics', current], queryFn: () => k8s.nodeMetrics(current), refetchInterval: 15000 });

  if (overview.isLoading) return <Loading label="Loading cluster overview…" />;
  if (overview.isError) return <ErrorBox error={overview.error} onRetry={() => overview.refetch()} />;

  const o = overview.data!;
  const pie = Object.entries(o.podsByPhase || {}).map(([name, value]) => ({ name, value: value as number }));
  const warnings = (events.data?.items || []).filter((e: any) => e.type === 'Warning').slice(0, 6);
  const recentEvents = (events.data?.items || []).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-100">Cluster Overview</h1>
        {o.isDemo && <Badge tone="yellow">demo data</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Nodes" value={o.counts.nodes} icon={<Server className="w-5 h-5" />} />
        <StatCard label="Pods" value={o.counts.pods} icon={<Box className="w-5 h-5" />} sub={`${o.podsByPhase?.Running || 0} running`} />
        <StatCard label="Deployments" value={o.counts.deployments} icon={<Layers className="w-5 h-5" />} />
        <StatCard label="Services" value={o.counts.services} icon={<Network className="w-5 h-5" />} sub={`${o.counts.ingresses} ingresses`} />
        <StatCard label="Warnings" value={o.warnings} icon={<AlertTriangle className="w-5 h-5" />} accent="text-amber-400" />
        <StatCard label="Restarts" value={o.restarts} icon={<RotateCcw className="w-5 h-5" />} accent="text-red-400" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Suspense fallback={<ChartSkeleton />}>
          <DashboardCharts pie={pie} counts={o.counts} />
        </Suspense>

        {/* Nodes */}
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-3">Nodes</h2>
          <div className="space-y-2.5 max-h-52 overflow-auto pr-1">
            {(nodes.data?.items || []).map((n: any) => {
              const ready = (n.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True';
              const m: any = (nodeMetrics.data?.items || []).find((x: any) => (x.name || x.metadata?.name) === n.metadata?.name);
              const cpuPct = m?.cpuPercent ?? usagePct(m?.usage?.cpu, n.status?.capacity?.cpu);
              const memPct = m?.memoryPercent ?? memUsagePct(m?.usage?.memory, n.status?.capacity?.memory);
              return (
                <div key={n.metadata?.name} className="bg-base-800/60 border border-base-700/50 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', ready ? 'bg-emerald-400' : 'bg-red-400')} />
                    <span className="font-mono text-xs text-slate-200 truncate">{n.metadata?.name}</span>
                    <span className="text-[10px] text-slate-500 ml-auto shrink-0">{n.status?.nodeInfo?.kubeletVersion}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                    <Meter icon={<Cpu className="w-3 h-3" />} label="CPU" pct={cpuPct} />
                    <Meter icon={<MemoryStick className="w-3 h-3" />} label="MEM" pct={memPct} />
                  </div>
                </div>
              );
            })}
            {(nodes.data?.items || []).length === 0 && <p className="text-sm text-slate-500">No nodes.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Warnings */}
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Recent warnings
          </h2>
          {warnings.length === 0 && <p className="text-sm text-slate-500">No warnings — cluster looks healthy. 🎉</p>}
          <div className="space-y-2">
            {warnings.map((e: any, i: number) => (
              <div key={i} className="flex gap-2.5 text-sm bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="text-slate-200 text-[13px]">{e.message}</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">{e.involvedObject?.kind}/{e.involvedObject?.name} · {timeAgo(e.lastTimestamp || e.eventTime)} ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events */}
        <div className="ks-card p-4">
          <h2 className="font-semibold text-slate-200 mb-3">Latest events</h2>
          <div className="space-y-1.5 max-h-64 overflow-auto">
            {recentEvents.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 text-[13px] py-1.5 border-b border-base-800/60 last:border-0">
                <span className={cn('ks-badge shrink-0', e.type === 'Warning' ? toneClasses('yellow') : toneClasses('blue'))}>{e.reason}</span>
                <span className="text-slate-400 truncate flex-1">{e.message}</span>
                <span className="text-[11px] text-slate-600 shrink-0">{timeAgo(e.lastTimestamp || e.eventTime)}</span>
              </div>
            ))}
            {recentEvents.length === 0 && <p className="text-sm text-slate-500">No events.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <div key={i} className="ks-card p-4">
          <div className="h-4 w-32 bg-base-700 rounded animate-pulse mb-3" />
          <div className="h-52 bg-base-800/60 rounded-lg animate-pulse" />
        </div>
      ))}
    </>
  );
}

function Meter({ icon, label, pct }: { icon: React.ReactNode; label: string; pct?: number }) {
  if (pct == null || isNaN(pct)) return <div className="text-slate-600 flex items-center gap-1">{icon} {label} —</div>;
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center gap-1 text-slate-400">{icon} {label} <span className="ml-auto font-mono">{Math.round(pct)}%</span></div>
      <div className="h-1.5 bg-base-700 rounded-full mt-1 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function usagePct(usage?: string, capacity?: string): number | undefined {
  if (!usage || !capacity) return undefined;
  const u = cpuStr(usage);
  const c = cpuStr(capacity);
  if (!c) return undefined;
  return (u / c) * 100;
}

function cpuStr(s: string): number {
  if (s.endsWith('n')) return parseInt(s) / 1e9;
  if (s.endsWith('u')) return parseInt(s) / 1e6;
  if (s.endsWith('m')) return parseInt(s) / 1000;
  return parseFloat(s);
}

function memUsagePct(usage?: string, capacity?: string): number | undefined {
  if (!usage || !capacity) return undefined;
  const u = memStr(usage);
  const c = memStr(capacity);
  if (!c) return undefined;
  return (u / c) * 100;
}

function memStr(s: string): number {
  const m = s.match(/^([\d.]+)([A-Za-z]*)$/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const mult: Record<string, number> = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, K: 1000, M: 1000 ** 2, G: 1000 ** 3, '': 1 };
  return v * (mult[m[2]] ?? 1);
}
