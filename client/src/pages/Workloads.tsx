import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw, Plus, Minus } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

type Tab = 'deployments' | 'statefulsets' | 'daemonsets' | 'replicasets' | 'jobs' | 'cronjobs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'deployments', label: 'Deployments' },
  { id: 'statefulsets', label: 'StatefulSets' },
  { id: 'daemonsets', label: 'DaemonSets' },
  { id: 'replicasets', label: 'ReplicaSets' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'cronjobs', label: 'CronJobs' },
];

export function Workloads() {
  const { current, namespace } = useCluster();
  const [tab, setTab] = useState<Tab>('deployments');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['workloads', current, namespace, tab],
    queryFn: () => k8s.list(current, tab, namespace),
    refetchInterval: 15000,
  });

  if (isLoading) return <Loading label={`Loading ${tab}…`} />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Workloads</h1>
        <div className="flex items-center gap-2">
          <NamespaceFilter />
          <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'px-3 py-1.5 rounded-lg text-sm bg-accent-600/25 text-accent-200 font-medium'
                : 'px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-base-800'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'deployments' && (
        <DeploymentTable key={tab} rows={rows} search={search} showNs={namespace === 'all'} onOpen={setTarget} />
      )}
      {tab === 'statefulsets' && (
        <StatefulSetTable key={tab} rows={rows} search={search} showNs={namespace === 'all'} onOpen={setTarget} />
      )}
      {tab !== 'deployments' && tab !== 'statefulsets' && (
        <GenericWorkloadTable key={tab} kind={tab} rows={rows} search={search} showNs={namespace === 'all'} onOpen={setTarget} />
      )}
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function availBadge(ready: number, desired: number) {
  if (desired === 0) return <Badge tone="gray">Scaled to 0</Badge>;
  if (ready >= desired) return <Badge tone="green">Available</Badge>;
  if (ready === 0) return <Badge tone="red">Unavailable</Badge>;
  return <Badge tone="yellow">Progressing</Badge>;
}

function DeploymentTable({ rows, search, showNs, onOpen }: Common) {
  const { current } = useCluster();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
      qc.invalidateQueries();
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    } finally {
      setBusy('');
    }
  };

  const columns: Column<any>[] = [
    nameCol(showNs),
    readyCol((d) => `${d.status?.readyReplicas || 0}/${d.status?.replicas || 0}`),
    {
      key: 'status',
      header: 'Status',
      render: (d) => availBadge(d.status?.readyReplicas || 0, d.spec?.replicas ?? 1),
    },
    ageCol(),
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => {
        const ns = d.metadata?.namespace;
        const nm = d.metadata?.name;
        const rep = d.spec?.replicas ?? 1;
        return (
          <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              className="ks-btn-ghost !p-1.5"
              title="Decrease replicas"
              disabled={busy !== ''}
              onClick={() => act(`${nm}-`, () => k8s.scaleDeployment(current, ns, nm, Math.max(0, rep - 1)))}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-slate-300 px-1 self-center" title="Replicas">
              {busy ? '…' : rep}
            </span>
            <button
              className="ks-btn-ghost !p-1.5"
              title="Increase replicas"
              disabled={busy !== ''}
              onClick={() => act(`${nm}+`, () => k8s.scaleDeployment(current, ns, nm, rep + 1))}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              className="ks-btn-ghost !p-1.5"
              title="Restart (rollout restart)"
              disabled={busy !== ''}
              onClick={() => act(`${nm}r`, () => k8s.restartDeployment(current, ns, nm))}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      rows={rows}
      keyOf={(d) => d.metadata?.uid || `${d.metadata?.namespace}/${d.metadata?.name}`}
      search={search}
      emptyTitle="No deployments found"
      onRowClick={(d) => onOpen({ kind: 'deployments', namespace: d.metadata?.namespace, name: d.metadata?.name })}
    />
  );
}

function StatefulSetTable({ rows, search, showNs, onOpen }: Common) {
  const { current } = useCluster();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');

  const scale = async (ns: string, nm: string, rep: number) => {
    setBusy(nm);
    try {
      await k8s.scaleStatefulSet(current, ns, nm, rep);
      qc.invalidateQueries();
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    } finally {
      setBusy('');
    }
  };

  const columns: Column<any>[] = [
    nameCol(showNs),
    readyCol((s) => `${s.status?.readyReplicas || 0}/${s.status?.replicas || 0}`),
    {
      key: 'status',
      header: 'Status',
      render: (s) => availBadge(s.status?.readyReplicas || 0, s.spec?.replicas ?? 1),
    },
    ageCol(),
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => {
        const ns = s.metadata?.namespace;
        const nm = s.metadata?.name;
        const rep = s.spec?.replicas ?? 1;
        return (
          <span className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
            <button
              className="ks-btn-ghost !p-1.5"
              title="Decrease replicas"
              disabled={busy !== ''}
              onClick={() => scale(ns, nm, Math.max(0, rep - 1))}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-slate-300 px-1">{busy === nm ? '…' : rep}</span>
            <button
              className="ks-btn-ghost !p-1.5"
              title="Increase replicas"
              disabled={busy !== ''}
              onClick={() => scale(ns, nm, rep + 1)}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      rows={rows}
      keyOf={(s) => s.metadata?.uid || `${s.metadata?.namespace}/${s.metadata?.name}`}
      search={search}
      emptyTitle="No statefulsets found"
      onRowClick={(s) => onOpen({ kind: 'statefulsets', namespace: s.metadata?.namespace, name: s.metadata?.name })}
    />
  );
}

function GenericWorkloadTable({ kind, rows, search, showNs, onOpen }: Common & { kind: Tab }) {
  const readyText = (r: any): string => {
    switch (kind) {
      case 'daemonsets':
        return `${r.status?.numberReady || 0}/${r.status?.desiredNumberScheduled || 0}`;
      case 'replicasets':
        return `${r.status?.readyReplicas || 0}/${r.status?.replicas || 0}`;
      case 'jobs':
        return r.status?.succeeded ? `✓ ${r.status.succeeded}` : r.status?.failed ? `✗ ${r.status.failed}` : 'running';
      case 'cronjobs':
        return r.spec?.suspend ? 'suspended' : r.spec?.schedule || '-';
      default:
        return '-';
    }
  };

  const columns: Column<any>[] = [
    nameCol(showNs),
    ...(kind === 'cronjobs'
      ? [{ key: 'sched', header: 'Schedule', render: (r: any) => <span className="font-mono text-[12px] text-slate-300">{r.spec?.schedule || '-'}</span> } as Column<any>]
      : [
          {
            key: 'ready',
            header: kind === 'jobs' ? 'Status' : 'Ready',
            render: (r: any) => <span className="font-mono text-slate-300">{readyText(r)}</span>,
          } as Column<any>,
        ]),
    ageCol(),
  ];

  return (
    <ResourceTable
      columns={columns}
      rows={rows}
      keyOf={(r) => r.metadata?.uid || `${r.metadata?.namespace}/${r.metadata?.name}`}
      search={search}
      emptyTitle={`No ${kind} found`}
      onRowClick={(r) => onOpen({ kind, namespace: r.metadata?.namespace, name: r.metadata?.name })}
    />
  );
}

interface Common {
  rows: any[];
  search: string;
  showNs: boolean;
  onOpen: (t: DrawerTarget) => void;
}

function nameCol(showNs: boolean): Column<any> {
  return {
    key: 'name',
    header: 'Name',
    render: (r) => (
      <span>
        <span className="font-mono text-[13px] text-slate-200 break-all">{r.metadata?.name}</span>
        {showNs && <span className="block font-mono text-[11px] text-slate-500">{r.metadata?.namespace}</span>}
      </span>
    ),
    sortValue: (r) => r.metadata?.name || '',
  };
}

function readyCol(fn: (r: any) => string): Column<any> {
  return {
    key: 'ready',
    header: 'Ready',
    render: (r) => <span className="font-mono text-slate-300">{fn(r)}</span>,
  };
}

function ageCol(): Column<any> {
  return {
    key: 'age',
    header: 'Age',
    render: (r) => <span className="text-slate-400">{timeAgo(r.metadata?.creationTimestamp)}</span>,
    sortValue: (r) => r.metadata?.creationTimestamp || '',
  };
}
