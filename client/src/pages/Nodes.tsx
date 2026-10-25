import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

export function Nodes() {
  const { current } = useCluster();
  const [selected, setSelected] = useState<string | null>(null);
  const metrics = useQuery({ queryKey: ['nodeMetrics', current], queryFn: () => k8s.nodeMetrics(current), refetchInterval: 15000 });

  const metricFor = (name: string) =>
    (metrics.data?.items || []).find((x: any) => (x.name || x.metadata?.name) === name);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Nodes</h1>
      <ResourceTable
        kind="nodes"
        namespaces={false}
        onRowClick={(n) => setSelected(n.metadata?.name)}
        searchKeys={['metadata.name']}
        columns={[
          { key: 'name', header: 'Name', render: (n) => <span className="font-mono text-[13px] text-slate-100">{n.metadata?.name}</span>, sortValue: (n) => n.metadata?.name || '' },
          {
            key: 'status', header: 'Status',
            render: (n) => {
              const ready = (n.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True';
              return <Badge tone={ready ? 'green' : 'red'}>{ready ? 'Ready' : 'NotReady'}</Badge>;
            },
          },
          { key: 'roles', header: 'Roles', render: (n) => <span className="text-slate-400 text-[13px]">{rolesOf(n) || '-'}</span> },
          {
            key: 'cpu', header: 'CPU', render: (n) => {
              const m = metricFor(n.metadata?.name);
              const t = m?.usage?.cpu || m?.cpu?.usage;
              return <span className="font-mono text-[13px] text-slate-300">{t ? `${t} / ${n.status?.capacity?.cpu}` : n.status?.capacity?.cpu || '-'}</span>;
            },
          },
          {
            key: 'mem', header: 'Memory', render: (n) => {
              const m = metricFor(n.metadata?.name);
              const t = m?.usage?.memory || m?.memory?.usage;
              return <span className="font-mono text-[13px] text-slate-300">{t ? `${t} / ${n.status?.capacity?.memory}` : n.status?.capacity?.memory || '-'}</span>;
            },
          },
          { key: 'ip', header: 'Internal IP', render: (n) => <span className="font-mono text-[13px] text-slate-400">{(n.status?.addresses || []).find((a: any) => a.type === 'InternalIP')?.address || '-'}</span> },
          { key: 'version', header: 'Kubelet', render: (n) => <span className="font-mono text-[13px] text-slate-400">{n.status?.nodeInfo?.kubeletVersion || '-'}</span> },
          { key: 'age', header: 'Age', render: (n) => <span className="text-slate-400">{timeAgo(n.metadata?.creationTimestamp)}</span>, sortValue: (n) => n.metadata?.creationTimestamp || '' },
        ]}
      />
      {selected && <ResourceDrawer kind="nodes" namespace="-" name={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function rolesOf(n: any): string {
  const labels = n.metadata?.labels || {};
  const roles = Object.keys(labels)
    .filter((k) => k.startsWith('node-role.kubernetes.io/'))
    .map((k) => k.replace('node-role.kubernetes.io/', '') || 'master');
  return roles.join(', ');
}
