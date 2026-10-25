import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo, cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

const TABS = [
  { id: 'services', label: 'Services' },
  { id: 'ingresses', label: 'Ingresses' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'networkpolicies', label: 'NetworkPolicies' },
];

export function Network() {
  const { namespace } = useCluster();
  const [tab, setTab] = useState('services');
  const [selected, setSelected] = useState<any | null>(null);

  const nsCol = namespace === 'all'
    ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }]
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Network</h1>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.id ? 'bg-accent-600/20 text-accent-300 border border-accent-600/40' : 'text-slate-400 hover:text-slate-200 bg-base-800/60 border border-transparent')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'services' && (
        <ResourceTable kind="services" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'type', header: 'Type', render: (s) => <Badge tone={s.spec?.type === 'LoadBalancer' ? 'green' : s.spec?.type === 'NodePort' ? 'blue' : 'gray'}>{s.spec?.type}</Badge> },
          { key: 'cip', header: 'Cluster IP', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.spec?.clusterIP || '-'}</span> },
          { key: 'ext', header: 'External', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.status?.loadBalancer?.ingress?.map((i: any) => i.ip || i.hostname).join(', ') || '-'}</span> },
          { key: 'ports', header: 'Ports', render: (s) => <span className="font-mono text-[13px] text-slate-400">{(s.spec?.ports || []).map((p: any) => p.port).join(', ')}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'ingresses' && (
        <ResourceTable kind="ingresses" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'hosts', header: 'Hosts', render: (s) => <span className="font-mono text-[13px] text-accent-300">{(s.spec?.rules || []).map((r: any) => r.host).join(', ') || '-'}</span> },
          { key: 'addr', header: 'Address', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.status?.loadBalancer?.ingress?.map((i: any) => i.ip || i.hostname).join(', ') || '-'}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'endpoints' && (
        <ResourceTable kind="endpoints" columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'addrs', header: 'Addresses', render: (s) => <span className="font-mono text-[13px] text-slate-400">{(s.subsets || []).flatMap((x: any) => (x.addresses || []).map((a: any) => a.ip)).slice(0, 4).join(', ') || '-'}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'networkpolicies' && (
        <ResourceTable kind="networkpolicies" columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'types', header: 'Policy types', render: (s) => <span className="text-slate-400 text-[13px]">{(s.spec?.policyTypes || []).join(', ')}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}

      {selected && tab !== 'endpoints' && tab !== 'networkpolicies' && (
        <ResourceDrawer kind={tab} namespace={selected.metadata?.namespace} name={selected.metadata?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
