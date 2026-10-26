import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

type Tab = 'roles' | 'rolebindings' | 'clusterroles' | 'clusterrolebindings' | 'serviceaccounts';

const TABS: { id: Tab; label: string; scoped: boolean }[] = [
  { id: 'roles', label: 'Roles', scoped: true },
  { id: 'rolebindings', label: 'RoleBindings', scoped: true },
  { id: 'clusterroles', label: 'ClusterRoles', scoped: false },
  { id: 'clusterrolebindings', label: 'ClusterRoleBindings', scoped: false },
  { id: 'serviceaccounts', label: 'ServiceAccounts', scoped: true },
];

export function Rbac() {
  const { current, namespace } = useCluster();
  const [tab, setTab] = useState<Tab>('roles');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const meta = TABS.find((t) => t.id === tab)!;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rbac', current, tab, meta.scoped ? namespace : 'all'],
    queryFn: () => k8s.list(current, tab, meta.scoped ? namespace : 'all'),
    refetchInterval: 20000,
  });

  if (isLoading) return <Loading label={`Loading ${tab}…`} />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];
  const showNs = meta.scoped && namespace === 'all';

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Access control (RBAC)</h1>
        <div className="flex items-center gap-2">
          {meta.scoped && <NamespaceFilter />}
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
        emptyTitle={`No ${tab} found`}
        onRowClick={(r) =>
          setTarget({ kind: tab, namespace: r.metadata?.namespace || '-', name: r.metadata?.name })
        }
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function extraColumns(tab: Tab): Column<any>[] {
  if (tab === 'roles' || tab === 'clusterroles') {
    return [
      {
        key: 'rules',
        header: 'Rules',
        render: (r) => <span className="font-mono text-slate-300">{(r.rules || []).length}</span>,
      },
    ];
  }
  if (tab === 'rolebindings' || tab === 'clusterrolebindings') {
    return [
      {
        key: 'role',
        header: 'Role ref',
        render: (r) => (
          <span className="font-mono text-[12px] text-slate-300">
            {r.roleRef ? `${r.roleRef.kind}/${r.roleRef.name}` : '-'}
          </span>
        ),
      },
      {
        key: 'subjects',
        header: 'Subjects',
        render: (r) => <span className="font-mono text-slate-300">{(r.subjects || []).length}</span>,
      },
    ];
  }
  return [
    {
      key: 'secrets',
      header: 'Secrets',
      render: (r) => <span className="font-mono text-slate-300">{(r.secrets || []).length}</span>,
    },
  ];
}
