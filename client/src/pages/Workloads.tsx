import React, { useState } from 'react';
import { useCluster } from '../context/ClusterContext';
import { timeAgo } from '../lib/utils';
import { cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { ResourceDrawer } from '../components/ResourceDrawer';
import { Badge } from '../components/ui';

const TABS = [
  { id: 'deployments', label: 'Deployments' },
  { id: 'statefulsets', label: 'StatefulSets' },
  { id: 'daemonsets', label: 'DaemonSets' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'cronjobs', label: 'CronJobs' },
  { id: 'hpas', label: 'HPA' },
];

export function Workloads() {
  const { namespace } = useCluster();
  const [tab, setTab] = useState('deployments');
  const [selected, setSelected] = useState<any | null>(null);

  const nsCol = namespace === 'all'
    ? [{ key: 'ns', header: 'Namespace', render: (p: any) => <span className="text-slate-400">{p.metadata?.namespace}</span> }]
    : [];
  const ageCol = { key: 'age', header: 'Age', render: (p: any) => <span className="text-slate-400">{timeAgo(p.metadata?.creationTimestamp)}</span>, sortValue: (p: any) => p.metadata?.creationTimestamp || '' };
  const nameCol = { key: 'name', header: 'Name', render: (p: any) => <span className="font-mono text-[13px] text-slate-100">{p.metadata?.name}</span>, sortValue: (p: any) => p.metadata?.name || '' };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Workloads</h1>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.id ? 'bg-accent-600/20 text-accent-300 border border-accent-600/40' : 'text-slate-400 hover:text-slate-200 bg-base-800/60 border border-transparent')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'deployments' && (
        <ResourceTable kind="deployments" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'ready', header: 'Ready', render: (d) => <span className="font-mono text-[13px]">{d.status?.readyReplicas ?? 0}/{d.spec?.replicas ?? 0}</span> },
          { key: 'up', header: 'Up-to-date', render: (d) => <span className="font-mono text-[13px] text-slate-400">{d.status?.updatedReplicas ?? 0}</span> },
          { key: 'avail', header: 'Available', render: (d) => <Badge tone={(d.status?.availableReplicas ?? 0) >= (d.spec?.replicas ?? 0) ? 'green' : 'yellow'}>{d.status?.availableReplicas ?? 0}</Badge> },
          ageCol,
        ]} />
      )}
      {tab === 'statefulsets' && (
        <ResourceTable kind="statefulsets" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'ready', header: 'Ready', render: (d) => <span className="font-mono text-[13px]">{d.status?.readyReplicas ?? 0}/{d.spec?.replicas ?? 0}</span> },
          ageCol,
        ]} />
      )}
      {tab === 'daemonsets' && (
        <ResourceTable kind="daemonsets" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'ready', header: 'Ready', render: (d) => <span className="font-mono text-[13px]">{d.status?.numberReady ?? 0}/{d.status?.desiredNumberScheduled ?? 0}</span> },
          ageCol,
        ]} />
      )}
      {tab === 'jobs' && (
        <ResourceTable kind="jobs" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'status', header: 'Status', render: (j) => (j.status?.succeeded ? <Badge tone="green">Succeeded</Badge> : j.status?.failed ? <Badge tone="red">Failed</Badge> : <Badge tone="blue">Active</Badge>) },
          { key: 'done', header: 'Completions', render: (j) => <span className="font-mono text-[13px]">{j.status?.succeeded ?? 0}/{j.spec?.completions ?? 1}</span> },
          ageCol,
        ]} />
      )}
      {tab === 'cronjobs' && (
        <ResourceTable kind="cronjobs" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'sched', header: 'Schedule', render: (j) => <span className="font-mono text-[13px] text-slate-300">{j.spec?.schedule}</span> },
          { key: 'last', header: 'Last run', render: (j) => <span className="text-slate-400">{j.status?.lastScheduleTime ? timeAgo(j.status.lastScheduleTime) : '-'}</span> },
          ageCol,
        ]} />
      )}
      {tab === 'hpas' && (
        <ResourceTable kind="hpas" onRowClick={setSelected} columns={[
          nameCol, ...nsCol,
          { key: 'target', header: 'Target', render: (h) => <span className="font-mono text-[13px] text-slate-300">{h.spec?.scaleTargetRef?.kind}/{h.spec?.scaleTargetRef?.name}</span> },
          { key: 'rep', header: 'Replicas', render: (h) => <span className="font-mono text-[13px]">{h.status?.currentReplicas ?? '-'} <span className="text-slate-500">({h.spec?.minReplicas}-{h.spec?.maxReplicas})</span></span> },
          ageCol,
        ]} />
      )}

      {selected && (
        <ResourceDrawer kind={tab} namespace={selected.metadata?.namespace} name={selected.metadata?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
