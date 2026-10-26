import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo, cn } from '../lib/utils';
import { Loading, ErrorBox, SearchInput, Badge } from '../components/ui';
import { NamespaceFilter } from '../components/NamespaceFilter';
import { ResourceTable, Column } from '../components/ResourceTable';

export function Events() {
  const { current, namespace } = useCluster();
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['events', current, namespace],
    queryFn: () => k8s.list(current, 'events', namespace),
    refetchInterval: 10000,
  });

  if (isLoading) return <Loading label="Loading events…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  let rows = Array.isArray(data?.items) ? data.items : [];
  if (warningsOnly) rows = rows.filter((e: any) => e.type === 'Warning');
  const showNs = namespace === 'all';

  const columns: Column<any>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (e) => <Badge tone={e.type === 'Warning' ? 'yellow' : 'blue'}>{e.type || 'Normal'}</Badge>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (e) => <span className="font-mono text-[12px] text-slate-300">{e.reason || '-'}</span>,
      sortValue: (e) => e.reason || '',
    },
    {
      key: 'object',
      header: 'Object',
      render: (e) => (
        <span>
          <span className="font-mono text-[12px] text-slate-200 break-all">
            {e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : '-'}
          </span>
          {showNs && e.involvedObject?.namespace && (
            <span className="block font-mono text-[11px] text-slate-500">{e.involvedObject.namespace}</span>
          )}
        </span>
      ),
      sortValue: (e) => e.involvedObject?.name || '',
    },
    {
      key: 'message',
      header: 'Message',
      render: (e) => <span className="text-slate-300 text-[13px]">{e.message || '-'}</span>,
    },
    {
      key: 'count',
      header: 'Count',
      render: (e) => <span className="font-mono text-slate-300">{e.count || 1}</span>,
      sortValue: (e) => e.count || 1,
    },
    {
      key: 'last',
      header: 'Last seen',
      render: (e) => <span className="text-slate-400">{timeAgo(e.lastTimestamp || e.eventTime)} ago</span>,
      sortValue: (e) => e.lastTimestamp || e.eventTime || '',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-100">Events <span className="text-sm font-normal text-slate-500">({rows.length})</span></h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWarningsOnly(!warningsOnly)}
            className={cn('ks-btn-ghost !py-2', warningsOnly && '!text-amber-300 !border-amber-500/40')}
          >
            Warnings only
          </button>
          <NamespaceFilter />
          <SearchInput value={search} onChange={setSearch} placeholder="Search events…" />
        </div>
      </div>
      <ResourceTable columns={columns} rows={rows} keyOf={(e) => e.metadata?.uid || `${e.involvedObject?.kind}/${e.involvedObject?.namespace}/${e.involvedObject?.name}/${e.reason}/${e.lastTimestamp}`} search={search} emptyTitle="No events found" />
    </div>
  );
}
