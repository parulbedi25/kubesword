import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo, cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';

const TABS = [
  { id: 'roles', label: 'Roles' },
  { id: 'clusterroles', label: 'ClusterRoles' },
  { id: 'serviceaccounts', label: 'ServiceAccounts' },
];

export function Rbac() {
  const { namespace } = useCluster();
  const [tab, setTab] = useState('roles');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">RBAC</h1>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.id ? 'bg-accent-600/20 text-accent-300 border border-accent-600/40' : 'text-slate-400 hover:text-slate-200 bg-base-800/60 border border-transparent')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'roles' && (
        <ResourceTable kind="roles" columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...(namespace === 'all' ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }] : []),
          { key: 'rules', header: 'Rules', render: (s) => <span className="font-mono text-slate-400">{(s.rules || []).length}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'clusterroles' && (
        <ResourceTable kind="clusterroles" namespaces={false} columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          { key: 'rules', header: 'Rules', render: (s) => <span className="font-mono text-slate-400">{(s.rules || []).length}</span> },
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
      {tab === 'serviceaccounts' && (
        <ResourceTable kind="serviceaccounts" columns={[
          { key: 'name', header: 'Name', render: (s) => <span className="font-mono text-[13px] text-slate-100">{s.metadata?.name}</span>, sortValue: (s) => s.metadata?.name || '' },
          ...(namespace === 'all' ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }] : []),
          { key: 'age', header: 'Age', render: (s) => <span className="text-slate-400">{timeAgo(s.metadata?.creationTimestamp)}</span> },
        ]} />
      )}
    </div>
  );
}
