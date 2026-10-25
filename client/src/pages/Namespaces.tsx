import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge, Modal } from '../components/ui';

export function Namespaces() {
  const { current, isDemo } = useCluster();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const create = async () => {
    setError('');
    try {
      await k8s.createNamespace(current, name.trim());
      qc.invalidateQueries();
      setCreating(false);
      setName('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Namespaces</h1>
      <ResourceTable
        kind="namespaces"
        namespaces={false}
        onRowClick={(n) => setSelected(n.metadata?.name)}
        searchKeys={['metadata.name']}
        actions={!isDemo ? (
          <button className="ks-btn-primary !py-2" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Namespace</button>
        ) : undefined}
        columns={[
          { key: 'name', header: 'Name', render: (n) => <span className="font-mono text-[13px] text-slate-100">{n.metadata?.name}</span>, sortValue: (n) => n.metadata?.name || '' },
          { key: 'status', header: 'Status', render: (n) => <Badge tone={n.status?.phase === 'Active' ? 'green' : 'yellow'}>{n.status?.phase}</Badge> },
          { key: 'age', header: 'Age', render: (n) => <span className="text-slate-400">{timeAgo(n.metadata?.creationTimestamp)}</span> },
        ]}
      />
      {selected && <ResourceDrawer kind="namespaces" namespace="-" name={selected} onClose={() => setSelected(null)} />}
      {creating && (
        <Modal title="Create namespace" onClose={() => setCreating(false)}>
          <label className="text-xs font-semibold text-slate-400 uppercase">Name</label>
          <input className="ks-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-namespace" />
          {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className="ks-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="ks-btn-primary" onClick={create}>Create</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
