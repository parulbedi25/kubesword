import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

type Tab = 'persistentvolumeclaims' | 'persistentvolumes' | 'storageclasses';

const TABS: { id: Tab; label: string }[] = [
  { id: 'persistentvolumeclaims', label: 'Claims (PVC)' },
  { id: 'persistentvolumes', label: 'Volumes (PV)' },
  { id: 'storageclasses', label: 'StorageClasses' },
];

export function Storage() {
  const { current, namespace } = useCluster();
  const [tab, setTab] = useState<Tab>('persistentvolumeclaims');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['storage', current, tab, tab === 'persistentvolumeclaims' ? namespace : 'all'],
    queryFn: () => k8s.list(current, tab, tab === 'persistentvolumeclaims' ? namespace : 'all'),
    refetchInterval: 15000,
  });

  if (isLoading) return <Loading label="Loading storage…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];
  const showNs = namespace === 'all' && tab === 'persistentvolumeclaims';

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
    ...extraColumns(tab),
    {
      key: 'age',
      header: 'Age',
      render: (r) => <span className="text-slate-400">{timeAgo(r.metadata?.creationTimestamp)}</span>,
      sortValue: (r) => r.metadata?.creationTimestamp || '',
    },
  ];

  const openTarget = (r: any): DrawerTarget =>
    tab === 'persistentvolumeclaims'
      ? { kind: tab, namespace: r.metadata?.namespace, name: r.metadata?.name }
      : { kind: tab, namespace: '-', name: r.metadata?.name };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Storage</h1>
        <div className="flex items-center gap-2">
          {tab === 'persistentvolumeclaims' && <NamespaceFilter />}
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
      <ResourceTable
        key={tab}
        columns={columns}
        rows={rows}
        keyOf={(r) => r.metadata?.uid || `${r.metadata?.namespace || '-'}/${r.metadata?.name}`}
        search={search}
        emptyTitle="No storage resources found"
        onRowClick={(r) => setTarget(openTarget(r))}
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function phaseBadge(phase?: string) {
  if (phase === 'Bound' || phase === 'Available') return <Badge tone="green">{phase}</Badge>;
  if (phase === 'Pending') return <Badge tone="yellow">{phase}</Badge>;
  if (phase === 'Failed' || phase === 'Released') return <Badge tone="red">{phase}</Badge>;
  return <Badge tone="gray">{phase || '-'}</Badge>;
}

function extraColumns(tab: Tab): Column<any>[] {
  if (tab === 'persistentvolumeclaims') {
    return [
      { key: 'phase', header: 'Status', render: (r) => phaseBadge(r.status?.phase) },
      {
        key: 'vol',
        header: 'Volume',
        render: (r) => <span className="font-mono text-[12px] text-slate-400">{r.spec?.volumeName || '-'}</span>,
      },
      {
        key: 'cap',
        header: 'Capacity',
        render: (r) => <span className="font-mono text-slate-300">{r.status?.capacity?.storage || r.spec?.resources?.requests?.storage || '-'}</span>,
      },
      {
        key: 'class',
        header: 'StorageClass',
        render: (r) => <span className="font-mono text-[12px] text-slate-400">{r.spec?.storageClassName || '-'}</span>,
      },
    ];
  }
  if (tab === 'persistentvolumes') {
    return [
      { key: 'phase', header: 'Status', render: (r) => phaseBadge(r.status?.phase) },
      {
        key: 'cap',
        header: 'Capacity',
        render: (r) => <span className="font-mono text-slate-300">{r.spec?.capacity?.storage || '-'}</span>,
      },
      {
        key: 'class',
        header: 'StorageClass',
        render: (r) => <span className="font-mono text-[12px] text-slate-400">{r.spec?.storageClassName || '-'}</span>,
      },
      {
        key: 'claim',
        header: 'Claim',
        render: (r) => (
          <span className="font-mono text-[12px] text-slate-400">
            {r.spec?.claimRef ? `${r.spec.claimRef.namespace}/${r.spec.claimRef.name}` : '-'}
          </span>
        ),
      },
    ];
  }
  return [
    {
      key: 'prov',
      header: 'Provisioner',
      render: (r) => <span className="font-mono text-[12px] text-slate-300">{r.provisioner || '-'}</span>,
    },
    {
      key: 'reclaim',
      header: 'Reclaim policy',
      render: (r) => <span className="text-slate-300">{r.reclaimPolicy || '-'}</span>,
    },
    {
      key: 'binding',
      header: 'Volume binding',
      render: (r) => <span className="text-slate-300">{r.volumeBindingMode || '-'}</span>,
    },
  ];
}
