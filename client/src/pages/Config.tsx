import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo, cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

const TABS = [
  { id: 'configmaps', label: 'ConfigMaps' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'serviceaccounts', label: 'ServiceAccounts' },
];

export function Config() {
  const { namespace } = useCluster();
  const [tab, setTab] = useState('configmaps');
  const [selected, setSelected] = useState<any | null>(null);

  const nsCol = namespace === 'all'
    ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }]
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Config</h1>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.id ? 'bg-accent-600/20 text-accent-300 border border-accent-600/40' : 'text-slate-400 hover:text-slate-200 bg-base-800/60 border border-transparent')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'configmaps' && (
        <ResourceTable kind="configmaps" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'keys', header: 'Keys', render: (s) => <span className="font-mono text-[13px] text-slate-400">{Object.keys(s.data || {}).length}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'secrets' && (
        <ResourceTable kind="secrets" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'type', header: 'Type', render: (s) => <Badge tone="gray">{s.type || 'Opaque'}</Badge> },
          { key: 'keys', header: 'Keys', render: (s) => <span className="font-mono text-[13px] text-slate-400">{Object.keys(s.data || {}).length}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'serviceaccounts' && (
        <ResourceTable kind="serviceaccounts" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...nsCol,
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}

      {selected && (
        <ResourceDrawer kind={tab} namespace={selected.metadata?.namespace} name={selected.metadata?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
