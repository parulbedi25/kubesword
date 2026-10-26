import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

type Tab = 'configmaps' | 'secrets';

export function Config() {
  const { current, namespace } = useCluster();
  const [tab, setTab] = useState<Tab>('configmaps');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['config', current, namespace, tab],
    queryFn: () => k8s.list(current, tab, namespace),
    refetchInterval: 15000,
  });

  if (isLoading) return <Loading label={`Loading ${tab}…`} />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];
  const showNs = namespace === 'all';

  const keyCount = (r: any) => Object.keys(r.data || {}).length + Object.keys(r.binaryData || {}).length;

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <span>
          <span className="font-mono text-[13px] text-slate-200 break-all">{r.metadata?.name}</span>
          {showNs && <span className="block font-mono text-[11px] text-slate-500">{r.metadata?.namespace}</span>}
        </span>
      ),
      sortValue: (r) => r.metadata?.name || '',
    },
    ...(tab === 'secrets'
      ? [
          {
            key: 'type',
            header: 'Type',
            render: (r: any) => <span className="font-mono text-[12px] text-slate-300">{r.type || 'Opaque'}</span>,
          } as Column<any>,
        ]
      : []),
    {
      key: 'keys',
      header: 'Keys',
      render: (r) => <span className="font-mono text-slate-300">{keyCount(r)}</span>,
      sortValue: (r) => keyCount(r),
    },
    {
      key: 'age',
      header: 'Age',
      render: (r) => <span className="text-slate-400">{timeAgo(r.metadata?.creationTimestamp)}</span>,
      sortValue: (r) => r.metadata?.creationTimestamp || '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Config</h1>
        <div className="flex items-center gap-2">
          <NamespaceFilter />
          <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
        </div>
      </div>
      <div className="flex gap-1">
        {(['configmaps', 'secrets'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'px-3 py-1.5 rounded-lg text-sm bg-accent-600/25 text-accent-200 font-medium capitalize'
                : 'px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-base-800 capitalize'
            }
          >
            {t}
          </button>
        ))}
      </div>
      <ResourceTable
        key={tab}
        columns={columns}
        rows={rows}
        keyOf={(r) => r.metadata?.uid || `${r.metadata?.namespace}/${r.metadata?.name}`}
        search={search}
        emptyTitle={`No ${tab} found`}
        onRowClick={(r) => setTarget({ kind: tab, namespace: r.metadata?.namespace, name: r.metadata?.name })}
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
