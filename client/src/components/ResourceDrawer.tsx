import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { Drawer, Tabs } from './ui';
import { DescribeView } from './DescribeView';
import { YamlViewer } from './YamlViewer';
import { LogsViewer } from './LogsViewer';
import { TerminalView } from './TerminalView';
import { EventsList } from './EventsList';

export interface DrawerTarget {
  kind: string;
  namespace: string;
  name: string;
}

const POD_TABS = [
  { id: 'describe', label: 'Describe' },
  { id: 'logs', label: 'Logs' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'events', label: 'Events' },
  { id: 'yaml', label: 'YAML' },
];
const PLAIN_TABS = [
  { id: 'describe', label: 'Describe' },
  { id: 'events', label: 'Events' },
  { id: 'yaml', label: 'YAML' },
];

export function ResourceDrawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  const { current } = useCluster();
  const qc = useQueryClient();
  const [tab, setTab] = useState('describe');
  const [deleting, setDeleting] = useState(false);
  const tabs = target.kind === 'pods' ? POD_TABS : PLAIN_TABS;
  const containers = (target as any).containers as string[] | undefined;
  const [container, setContainer] = useState<string | undefined>(containers?.[0]);

  const remove = async () => {
    if (!confirm(`Delete ${target.kind}/${target.name}?\n\nThis acts on the live cluster and cannot be undone.`)) return;
    setDeleting(true);
    try {
      await k8s.remove(current, target.kind, target.namespace, target.name);
      qc.invalidateQueries();
      onClose();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
      setDeleting(false);
    }
  };

  return (
    <Drawer
      title={`${target.kind}/${target.name}`}
      subtitle={target.namespace !== '-' ? `namespace: ${target.namespace}` : 'cluster-scoped'}
      onClose={onClose}
    >
      <div className="flex items-center justify-between pr-4">
        <div className="flex-1 min-w-0">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>
        <button
          onClick={remove}
          disabled={deleting}
          className="ml-2 shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-300 disabled:opacity-50"
          title="Delete this resource"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {tab === 'describe' && (
        <DescribeView kind={target.kind} namespace={target.namespace} name={target.name} />
      )}
      {tab === 'events' && (
        <EventsList kind={target.kind} namespace={target.namespace} name={target.name} />
      )}
      {tab === 'yaml' && (
        <div className="p-5">
          <YamlViewer kind={target.kind} namespace={target.namespace} name={target.name} />
        </div>
      )}
      {target.kind === 'pods' && tab === 'logs' && (
        <div className="p-5">
          {containers && containers.length > 1 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500">Container:</span>
              <select className="ks-input !w-auto !py-1.5 !text-xs" value={container} onChange={(e) => setContainer(e.target.value)}>
                {containers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <LogsViewer namespace={target.namespace} pod={target.name} container={container} />
        </div>
      )}
      {target.kind === 'pods' && tab === 'terminal' && (
        <div className="p-5">
          {containers && containers.length > 1 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500">Container:</span>
              <select className="ks-input !w-auto !py-1.5 !text-xs" value={container} onChange={(e) => setContainer(e.target.value)}>
                {containers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <TerminalView namespace={target.namespace} pod={target.name} container={container} />
        </div>
      )}
    </Drawer>
  );
}
