import React, { useState } from 'react';
import { timeAgo, cn } from '../lib/utils';
import { ResourceTable } from '../components/ResourceTable';
import { Badge } from '../components/ui';

export function Events() {
  const [onlyWarnings, setOnlyWarnings] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-100">Events</h1>
        <button
          onClick={() => setOnlyWarnings(!onlyWarnings)}
          className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', onlyWarnings ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-base-800 border-base-600 text-slate-400 hover:text-slate-200')}
        >
          Warnings only
        </button>
      </div>
      <ResourceTable
        kind="events"
        refreshInterval={5000}
        filterFn={onlyWarnings ? (e: any) => e.type === 'Warning' : undefined}
        searchKeys={['reason', 'message', 'involvedObject.name', 'metadata.namespace']}
        columns={[
          { key: 'type', header: 'Type', render: (e) => <Badge tone={e.type === 'Warning' ? 'yellow' : 'blue'}>{e.type}</Badge> },
          { key: 'reason', header: 'Reason', render: (e) => <span className="font-medium text-[13px] text-slate-200">{e.reason}</span> },
          { key: 'object', header: 'Object', render: (e) => <span className="font-mono text-[12px] text-slate-400">{e.involvedObject?.kind}/{e.involvedObject?.name}</span> },
          { key: 'ns', header: 'Namespace', render: (e) => <span className="text-slate-400">{e.metadata?.namespace || '-'}</span> },
          { key: 'msg', header: 'Message', render: (e) => <span className="text-[13px] text-slate-300 block max-w-[480px] truncate" title={e.message}>{e.message}</span> },
          { key: 'count', header: 'Count', render: (e) => <span className="font-mono text-slate-400">{e.count || 1}</span> },
          { key: 'age', header: 'Last seen', render: (e) => <span className="text-slate-400">{timeAgo(e.lastTimestamp || e.eventTime)} ago</span> },
        ]}
      />
    </div>
  );
}
