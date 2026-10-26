import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, Badge } from './ui';

export function EventsList({ kind, namespace, name }: { kind: string; namespace: string; name: string }) {
  const { current } = useCluster();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['events-for', current, kind, namespace, name],
    queryFn: () => k8s.eventsFor(current, kind, namespace, name),
  });

  if (isLoading) return <Loading label="Loading events…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) return <p className="text-sm text-slate-500 p-5">No events for this resource.</p>;

  return (
    <div className="p-5 space-y-2">
      {items.map((e: any, i: number) => {
        const warn = e.type === 'Warning';
        return (
          <div key={e.metadata?.uid || i} className="flex items-start gap-3 rounded-lg border border-base-700/60 bg-base-800/40 p-3">
            <Badge tone={warn ? 'yellow' : 'blue'}>{e.reason || e.type}</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-slate-200 break-words">{e.message}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {e.count > 1 ? `×${e.count} · ` : ''}
                {timeAgo(e.lastTimestamp || e.eventTime)} ago
                {e.source?.component ? ` · ${e.source.component}` : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
