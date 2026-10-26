import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo, cn } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge } from '../components/ui';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

function nodeReady(n: any): boolean {
  return (n.status?.conditions || []).some((c: any) => c.type === 'Ready' && c.status === 'True');
}

export function Nodes() {
  const { current } = useCluster();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['nodes', current],
    queryFn: () => k8s.list(current, 'nodes'),
    refetchInterval: 20000,
  });

  if (isLoading) return <Loading label="Loading nodes…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (n) => <span className="font-mono text-[13px] text-slate-200">{n.metadata?.name}</span>,
      sortValue: (n) => n.metadata?.name || '',
    },
    {
      key: 'status',
      header: 'Status',
      render: (n) => {
        const ready = nodeReady(n);
        const unsched = n.spec?.unschedulable;
        return (
          <span className="flex gap-1.5">
            <Badge tone={ready ? 'green' : 'red'}>{ready ? 'Ready' : 'NotReady'}</Badge>
            {unsched && <Badge tone="yellow">SchedulingDisabled</Badge>}
          </span>
        );
      },
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (n) => {
        const labels = n.metadata?.labels || {};
        const roles = Object.keys(labels)
          .filter((k) => k.startsWith('node-role.kubernetes.io/'))
          .map((k) => k.split('/')[1])
          .filter(Boolean);
        const list = roles.length ? roles : ['worker'];
        return <span className="text-slate-300">{list.join(', ')}</span>;
      },
    },
    {
      key: 'cpu',
      header: 'CPU',
      render: (n) => <span className="font-mono text-slate-300">{n.status?.capacity?.cpu || '?'}</span>,
    },
    {
      key: 'mem',
      header: 'Memory',
      render: (n) => <span className="font-mono text-slate-300">{fmtMem(n.status?.capacity?.memory)}</span>,
    },
    {
      key: 'version',
      header: 'Kubelet',
      render: (n) => <span className="font-mono text-[12px] text-slate-400">{n.status?.nodeInfo?.kubeletVersion || '-'}</span>,
    },
    {
      key: 'age',
      header: 'Age',
      render: (n) => <span className="text-slate-400">{timeAgo(n.metadata?.creationTimestamp)}</span>,
      sortValue: (n) => n.metadata?.creationTimestamp || '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Nodes <span className="text-sm font-normal text-slate-500">({rows.length})</span></h1>
        <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Search nodes…" />
      </div>
      <ResourceTable
        columns={columns}
        rows={rows}
        keyOf={(n) => n.metadata?.uid || n.metadata?.name}
        search={search}
        emptyTitle="No nodes found"
        onRowClick={(n) => setTarget({ kind: 'nodes', namespace: '-', name: n.metadata?.name })}
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function fmtMem(ki?: string): string {
  if (!ki) return '?';
  const m = /^(\d+)(Ki|Mi|Gi)?$/.exec(ki);
  if (!m) return ki;
  const n = Number(m[1]);
  const mult = m[2] === 'Gi' ? 1024 * 1024 : m[2] === 'Mi' ? 1024 : 1;
  const gib = (n * mult) / (1024 * 1024);
  return gib >= 10 ? `${Math.round(gib)}Gi` : `${gib.toFixed(1)}Gi`;
}
