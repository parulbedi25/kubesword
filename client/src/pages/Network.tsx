import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

type Tab = 'services' | 'ingresses' | 'networkpolicies' | 'endpoints';

const TABS: { id: Tab; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'ingresses', label: 'Ingresses' },
  { id: 'networkpolicies', label: 'NetworkPolicies' },
  { id: 'endpoints', label: 'Endpoints' },
];

export function Network() {
  const { current, namespace } = useCluster();
  const [tab, setTab] = useState<Tab>('services');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['network', current, namespace, tab],
    queryFn: () => k8s.list(current, tab, namespace),
    refetchInterval: 15000,
  });

  if (isLoading) return <Loading label={`Loading ${tab}…`} />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];
  const showNs = namespace === 'all';

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
        <h1 className="text-xl font-bold text-slate-100">Network</h1>
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

function extraColumns(tab: Tab): Column<any>[] {
  if (tab === 'services') {
    return [
      {
        key: 'type',
        header: 'Type',
        render: (s) => <span className="text-slate-300">{s.spec?.type || '-'}</span>,
      },
      {
        key: 'clusterip',
        header: 'Cluster IP',
        render: (s) => <span className="font-mono text-[12px] text-slate-400">{s.spec?.clusterIP || '-'}</span>,
      },
      {
        key: 'external',
        header: 'External IP',
        render: (s) => {
          const ips = [
            ...(s.status?.loadBalancer?.ingress || []).map((i: any) => i.ip || i.hostname),
            ...(s.spec?.externalIPs || []),
          ].filter(Boolean);
          return <span className="font-mono text-[12px] text-slate-400">{ips.join(', ') || '-'}</span>;
        },
      },
      {
        key: 'ports',
        header: 'Ports',
        render: (s) => (
          <span className="font-mono text-[12px] text-slate-400">
            {(s.spec?.ports || [])
              .map((p: any) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol || 'TCP'}`)
              .join(', ') || '-'}
          </span>
        ),
      },
    ];
  }
  if (tab === 'ingresses') {
    return [
      {
        key: 'hosts',
        header: 'Hosts',
        render: (i) => (
          <span className="font-mono text-[12px] text-slate-400 break-all">
            {(i.spec?.rules || []).map((r: any) => r.host).filter(Boolean).join(', ') || '*'}
          </span>
        ),
      },
      {
        key: 'address',
        header: 'Address',
        render: (i) => (
          <span className="font-mono text-[12px] text-slate-400">
            {(i.status?.loadBalancer?.ingress || []).map((x: any) => x.ip || x.hostname).join(', ') || '-'}
          </span>
        ),
      },
    ];
  }
  if (tab === 'networkpolicies') {
    return [
      {
        key: 'podselector',
        header: 'Pod selector',
        render: (p) => (
          <span className="font-mono text-[12px] text-slate-400">
            {selText(p.spec?.podSelector?.matchLabels) || '<all pods>'}
          </span>
        ),
      },
      {
        key: 'policy',
        header: 'Policy types',
        render: (p) => <span className="text-slate-300">{(p.spec?.policyTypes || []).join(', ') || '-'}</span>,
      },
    ];
  }
  return [
    {
      key: 'endpoints',
      header: 'Endpoints',
      render: (e) => {
        const addrs = (e.subsets || []).flatMap((s: any) => (s.addresses || []).map((a: any) => a.ip));
        return <span className="font-mono text-[12px] text-slate-400">{addrs.slice(0, 3).join(', ') + (addrs.length > 3 ? ` +${addrs.length - 3}` : '') || '-'}</span>;
      },
    },
  ];
}

function selText(matchLabels?: Record<string, string>): string {
  if (!matchLabels) return '';
  return Object.entries(matchLabels).map(([k, v]) => `${k}=${v}`).join(', ');
}
