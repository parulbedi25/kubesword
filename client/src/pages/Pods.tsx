import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo, podStatus, restarts, readyCount } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

export function Pods() {
  const { current, namespace } = useCluster();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<(DrawerTarget & { containers?: string[] }) | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pods', current, namespace],
    queryFn: () => k8s.list(current, 'pods', namespace),
    refetchInterval: 10000,
  });

  if (isLoading) return <Loading label="Loading pods…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (p) => <span className="font-mono text-[13px] text-slate-200 break-all">{p.metadata?.name}</span>,
      sortValue: (p) => p.metadata?.name || '',
    },
    ...(namespace === 'all'
      ? [
          {
            key: 'ns',
            header: 'Namespace',
            render: (p: any) => <span className="font-mono text-[12px] text-slate-400">{p.metadata?.namespace}</span>,
            sortValue: (p: any) => p.metadata?.namespace || '',
          } as Column<any>,
        ]
      : []),
    {
      key: 'ready',
      header: 'Ready',
      render: (p) => <span className="font-mono text-slate-300">{readyCount(p)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const s = podStatus(p);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
      sortValue: (p) => podStatus(p).label,
    },
    {
      key: 'restarts',
      header: 'Restarts',
      render: (p) => {
        const r = restarts(p);
        return <span className={r > 5 ? 'text-red-300 font-semibold' : 'text-slate-300'}>{r}</span>;
      },
      sortValue: (p) => restarts(p),
    },
    {
      key: 'ip',
      header: 'IP',
      render: (p) => <span className="font-mono text-[12px] text-slate-400">{p.status?.podIP || '-'}</span>,
    },
    {
      key: 'node',
      header: 'Node',
      render: (p) => <span className="font-mono text-[12px] text-slate-400">{p.spec?.nodeName || '-'}</span>,
      sortValue: (p) => p.spec?.nodeName || '',
    },
    {
      key: 'age',
      header: 'Age',
      render: (p) => <span className="text-slate-400">{timeAgo(p.metadata?.creationTimestamp)}</span>,
      sortValue: (p) => p.metadata?.creationTimestamp || '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Pods <span className="text-sm font-normal text-slate-500">({rows.length})</span></h1>
        <div className="flex items-center gap-2">
          <NamespaceFilter />
          <SearchInput value={search} onChange={setSearch} placeholder="Search pods…" />
        </div>
      </div>
      <ResourceTable
        columns={columns}
        rows={rows}
        keyOf={(p) => p.metadata?.uid || `${p.metadata?.namespace}/${p.metadata?.name}`}
        search={search}
        emptyTitle="No pods found"
        emptyHint={namespace === 'all' ? undefined : `in namespace "${namespace}"`}
        onRowClick={(p) =>
          setTarget({
            kind: 'pods',
            namespace: p.metadata?.namespace,
            name: p.metadata?.name,
            containers: (p.spec?.containers || []).map((c: any) => c.name),
          })
        }
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
