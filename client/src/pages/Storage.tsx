import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo, cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

const TABS = [
  { id: 'pvcs', label: 'PersistentVolumeClaims' },
  { id: 'pvs', label: 'PersistentVolumes' },
  { id: 'storageclasses', label: 'StorageClasses' },
];

export function Storage() {
  const { namespace } = useCluster();
  const [tab, setTab] = useState('pvcs');
  const [selected, setSelected] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Storage</h1>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.id ? 'bg-accent-600/20 text-accent-300 border border-accent-600/40' : 'text-slate-400 hover:text-slate-200 bg-base-800/60 border border-transparent')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pvcs' && (
        <ResourceTable kind="pvcs" onRowClick={setSelected} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...(namespace === 'all' ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }] : []),
          { key: 'status', header: 'Status', render: (s) => <Badge tone={s.status?.phase === 'Bound' ? 'green' : 'yellow'}>{s.status?.phase}</Badge> },
          { key: 'cap', header: 'Capacity', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.status?.capacity?.storage || s.spec?.resources?.requests?.storage || '-'}</span> },
          { key: 'sc', header: 'StorageClass', render: (s) => <span className="text-slate-400 text-[13px]">{s.spec?.storageClassName || '-'}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'pvs' && (
        <ResourceTable kind="pvs" namespaces={false} onRowClick={(s) => setSelected({ ...s, metadata: { ...s.metadata, namespace: '-' } })} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          { key: 'status', header: 'Status', render: (s) => <Badge tone={s.status?.phase === 'Bound' ? 'green' : 'yellow'}>{s.status?.phase}</Badge> },
          { key: 'cap', header: 'Capacity', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.spec?.capacity?.storage || '-'}</span> },
          { key: 'claim', header: 'Claim', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.spec?.claimRef ? `${s.spec.claimRef.namespace}/${s.spec.claimRef.name}` : '-'}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'storageclasses' && (
        <ResourceTable kind="storageclasses" namespaces={false} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          { key: 'prov', header: 'Provisioner', render: (s) => <span className="font-mono text-[13px] text-slate-400">{s.provisioner}</span> },
          { key: 'reclaim', header: 'Reclaim', render: (s) => <span className="text-slate-400 text-[13px]">{s.reclaimPolicy}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}

      {selected && tab !== 'storageclasses' && (
        <ResourceDrawer kind={tab} namespace={selected.metadata?.namespace} name={selected.metadata?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
