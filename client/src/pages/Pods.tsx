import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo, podStatus, restarts, readyCount } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

export function Pods() {
  const { namespace } = useCluster();
  const [selected, setSelected] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Pods</h1>
      <ResourceTable
        kind="pods"
        onRowClick={setSelected}
        columns={[
          { key: 'name', header: 'Name', render: (p) => <span className="font-mono text-[13px] text-slate-100">{p.metadata?.name}</span>, sortValue: (p) => p.metadata?.name || '' },
          ...(namespace === 'all' ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span>, sortValue: (p: any) => p.metadata?.namespace || '' }] : []),
          {
            key: 'status', header: 'Status',
            render: (p) => { const s = podStatus(p); return <Badge tone={s.tone}>{s.label}</Badge>; },
            sortValue: (p) => podStatus(p).label,
          },
          { key: 'ready', header: 'Ready', render: (p) => <span className="font-mono text-[13px] text-slate-300">{readyCount(p)}</span> },
          {
            key: 'restarts', header: 'Restarts',
            render: (p) => { const r = restarts(p); return <span className={r > 5 ? 'text-red-300 font-mono' : 'text-slate-400 font-mono'}>{r}</span>; },
            sortValue: (p) => restarts(p),
          },
          { key: 'ip', header: 'IP', render: (p) => <span className="font-mono text-[13px] text-slate-400">{p.status?.podIP || '-'}</span> },
          { key: 'node', header: 'Node', render: (p) => <span className="font-mono text-[13px] text-slate-400 truncate block max-w-[180px]">{p.spec?.nodeName || '-'}</span> },
          { key: 'age', header: 'Age', render: (p) => <span className="text-slate-400">{timeAgo(p.metadata?.creationTimestamp)}</span>, sortValue: (p) => p.metadata?.creationTimestamp || '' },
        ]}
      />
      {selected && (
        <ResourceDrawer kind="pods" namespace={selected.metadata?.namespace} name={selected.metadata?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
