import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge, Modal } from '../components/ui';
import { ResourceTable, Column } from '../components/ResourceTable';
import { ResourceDrawer, DrawerTarget } from '../components/ResourceDrawer';

export function Namespaces() {
  const { current } = useCluster();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createErr, setCreateErr] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['namespaces', current],
    queryFn: () => k8s.list(current, 'namespaces'),
    refetchInterval: 20000,
  });

  if (isLoading) return <Loading label="Loading namespaces…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const rows = Array.isArray(data?.items) ? data.items : [];

  const create = async () => {
    const name = newName.trim().toLowerCase();
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      setCreateErr('Invalid name — use lowercase letters, numbers and dashes.');
      return;
    }
    setCreateErr('');
    try {
      await k8s.createNamespace(current, name);
      setCreating(false);
      setNewName('');
      qc.invalidateQueries();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (n) => <span className="font-mono text-[13px] text-slate-200">{n.metadata?.name}</span>,
      sortValue: (n) => n.metadata?.name || '',
    },
    {
      key: 'status',
      header: 'Status',
      render: (n) => (
        <Badge tone={n.status?.phase === 'Active' ? 'green' : 'yellow'}>{n.status?.phase || 'Unknown'}</Badge>
      ),
    },
    {
      key: 'labels',
      header: 'Labels',
      render: (n) => {
        const labels = n.metadata?.labels || {};
        const keys = Object.keys(labels);
        return <span className="text-slate-400">{keys.length === 0 ? '—' : keys.slice(0, 3).join(', ') + (keys.length > 3 ? ` +${keys.length - 3}` : '')}</span>;
      },
    },
    {
      key: 'age',
      header: 'Age',
      render: (n) => <span className="text-slate-400">{timeAgo(n.metadata?.creationTimestamp)}</span>,
      sortValue: (n) => n.metadata?.creationTimestamp || '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Namespaces <span className="text-sm font-normal text-slate-500">({rows.length})</span></h1>
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search namespaces…" />
          <button onClick={() => setCreating(true)} className="ks-btn-primary !py-2">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>
      <ResourceTable
        columns={columns}
        rows={rows}
        keyOf={(n) => n.metadata?.uid || n.metadata?.name}
        search={search}
        emptyTitle="No namespaces found"
        onRowClick={(n) => setTarget({ kind: 'namespaces', namespace: '-', name: n.metadata?.name })}
      />
      {target && <ResourceDrawer target={target} onClose={() => setTarget(null)} />}
      {creating && (
        <Modal title="Create namespace" onClose={() => setCreating(false)}>
          <label className="text-sm text-slate-300 font-medium">Name</label>
          <input
            className="ks-input mt-1.5 font-mono"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="my-namespace"
            onKeyDown={(e) => e.key === 'Enter' && create()}
            autoFocus
          />
          {createErr && <p className="text-sm text-red-300 mt-2">{createErr}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className="ks-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="ks-btn-primary" onClick={create}>Create</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
