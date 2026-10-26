import React, { useState, Suspense } from 'react';
import { lazyWithRetry } from '../lib/lazyRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, Scaling } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo, formatDate, podStatus, restarts } from '../lib/utils';
import { Drawer, Tabs, Loading, ErrorBox, Kv, Badge, Modal } from './ui';
import { YamlViewer } from './YamlViewer';
import { LogsViewer } from './LogsViewer';
// xterm is heavy — load it only when the terminal tab opens.
const TerminalView = lazyWithRetry(() => import('./TerminalView').then((m) => ({ default: m.TerminalView })));

export function ResourceDrawer({
  kind, namespace, name, onClose,
}: {
  kind: string; namespace: string; name: string; onClose: () => void;
}) {
  const { current, isDemo } = useCluster();
  const qc = useQueryClient();
  const [tab, setTab] = useState('details');
  const [container, setContainer] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);

  const query = useQuery({
    queryKey: ['resource', current, kind, namespace, name],
    queryFn: () => k8s.get(current, kind, namespace, name),
    refetchInterval: tab === 'details' ? 5000 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ['resource-events', current, kind, namespace, name],
    queryFn: () => k8s.eventsFor(current, kind, namespace, name),
    enabled: tab === 'events',
  });

  const item = query.data?.item;
  const isPod = kind === 'pods';
  const containers: string[] = item?.spec?.containers?.map((c: any) => c.name) || [];
  const activeContainer = container || containers[0];

  const tabs = [
    { id: 'details', label: 'Details' },
    ...(isPod ? [{ id: 'logs', label: 'Logs' }, { id: 'terminal', label: 'Terminal' }] : []),
    { id: 'events', label: 'Events' },
    { id: 'yaml', label: 'YAML' },
  ];

  const doDelete = async () => {
    await k8s.remove(current, kind, namespace, name);
    qc.invalidateQueries();
    onClose();
  };

  const doRestart = async () => {
    await k8s.restartDeployment(current, namespace, name);
    qc.invalidateQueries();
  };

  return (
    <Drawer title={`${kind}/${name}`} subtitle={namespace ? `Namespace: ${namespace}` : 'Cluster-scoped'} onClose={onClose}>
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-base-700/60 bg-base-850/40">
        {!isDemo && kind === 'deployments' && (
          <>
            <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={doRestart}><RotateCcw className="w-3.5 h-3.5" /> Restart</button>
            <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={() => setScaleOpen(true)}><Scaling className="w-3.5 h-3.5" /> Scale</button>
          </>
        )}
        {!isDemo && kind === 'statefulsets' && (
          <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={() => setScaleOpen(true)}><Scaling className="w-3.5 h-3.5" /> Scale</button>
        )}
        {isPod && containers.length > 1 && (
          <select className="ks-select !py-1.5 !text-xs" value={activeContainer} onChange={(e) => setContainer(e.target.value)}>
            {containers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex-1" />
        {!isDemo && kind !== 'nodes' && (
          <button className="ks-btn-danger !py-1.5 !text-xs" onClick={() => setConfirmDelete(true)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
        )}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'details' && (
        <div className="p-5">
          {query.isLoading ? <Loading /> : query.isError ? <ErrorBox error={query.error} /> : item && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {isPod && (() => { const s = podStatus(item); return <Badge tone={s.tone}>{s.label}</Badge>; })()}
                {item.status?.phase && !isPod && <Badge tone="blue">{item.status.phase}</Badge>}
                <Badge tone="gray">Age {timeAgo(item.metadata?.creationTimestamp)}</Badge>
                {isPod && <Badge tone={restarts(item) > 5 ? 'red' : 'gray'}>{restarts(item)} restarts</Badge>}
              </div>
              <div className="ks-card p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Metadata</h3>
                <Kv k="Name" v={item.metadata?.name} mono />
                {item.metadata?.namespace && <Kv k="Namespace" v={item.metadata.namespace} mono />}
                <Kv k="UID" v={item.metadata?.uid} mono />
                <Kv k="Created" v={formatDate(item.metadata?.creationTimestamp)} />
                {item.metadata?.labels && <Kv k="Labels" v={<Labels obj={item.metadata.labels} />} />}
                {item.metadata?.annotations && Object.keys(item.metadata.annotations).length > 0 && (
                  <Kv k="Annotations" v={<Labels obj={item.metadata.annotations} />} />
                )}
              </div>
              {isPod && <PodSpec item={item} />}
              {(kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets') && <WorkloadStatus item={item} />}
              {kind === 'services' && <ServiceSpec item={item} />}
              {kind === 'nodes' && <NodeSpec item={item} />}
              {kind === 'ingresses' && <IngressSpec item={item} />}
              {(kind === 'configmaps' || kind === 'secrets') && <DataKeys item={item} secret={kind === 'secrets'} />}
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && isPod && <LogsViewer namespace={namespace} pod={name} container={activeContainer} />}
      {tab === 'terminal' && isPod && (
        <Suspense fallback={<Loading label="Loading terminal…" />}>
          <TerminalView namespace={namespace} pod={name} container={activeContainer} />
        </Suspense>
      )}

      {tab === 'events' && (
        <div className="p-5">
          {eventsQuery.isLoading ? <Loading /> : eventsQuery.isError ? <ErrorBox error={eventsQuery.error} /> : (
            <div className="space-y-2">
              {(eventsQuery.data?.items || []).map((e: any, i: number) => (
                <div key={i} className="ks-card p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={e.type === 'Warning' ? 'yellow' : 'blue'}>{e.reason}</Badge>
                    <span className="text-xs text-slate-500 ml-auto">{timeAgo(e.lastTimestamp || e.eventTime)} ago × {e.count || 1}</span>
                  </div>
                  <p className="text-slate-300 mt-1.5">{e.message}</p>
                </div>
              ))}
              {(eventsQuery.data?.items || []).length === 0 && <p className="text-sm text-slate-500 text-center py-8">No events.</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'yaml' && <YamlViewer kind={kind} namespace={namespace} name={name} />}

      {confirmDelete && (
        <Modal title={`Delete ${kind}/${name}?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-slate-400">This will delete <span className="font-mono text-slate-200">{namespace ? `${namespace}/` : ''}{name}</span>. This action cannot be undone.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button className="ks-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="ks-btn-danger" onClick={doDelete}>Delete</button>
          </div>
        </Modal>
      )}
      {scaleOpen && <ScaleDialog kind={kind} namespace={namespace} name={name} current={item?.spec?.replicas ?? 1} onClose={() => setScaleOpen(false)} />}
    </Drawer>
  );
}

function Labels({ obj }: { obj: Record<string, string> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {Object.entries(obj).slice(0, 20).map(([k, v]) => (
        <span key={k} className="font-mono text-[11px] bg-base-800 border border-base-600 rounded px-1.5 py-0.5">{k}={String(v).slice(0, 60)}</span>
      ))}
    </span>
  );
}

function PodSpec({ item }: { item: any }) {
  return (
    <>
      <div className="ks-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Status</h3>
        <Kv k="Phase" v={item.status?.phase} mono />
        <Kv k="Pod IP" v={item.status?.podIP || '-'} mono />
        <Kv k="Node" v={item.spec?.nodeName || '-'} mono />
        <Kv k="QoS" v={item.status?.qosClass || '-'} />
      </div>
      <div className="ks-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Containers</h3>
        {(item.spec?.containers || []).map((c: any) => {
          const st = (item.status?.containerStatuses || []).find((s: any) => s.name === c.name);
          return (
            <div key={c.name} className="border-b border-base-800/60 last:border-0 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-slate-200">{c.name}</span>
                {st?.ready ? <Badge tone="green">Ready</Badge> : <Badge tone="yellow">NotReady</Badge>}
                <span className="text-xs text-slate-500 ml-auto">{st?.restartCount || 0} restarts</span>
              </div>
              <p className="font-mono text-xs text-slate-500 mt-1 break-all">{c.image}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WorkloadStatus({ item }: { item: any }) {
  const s = item.status || {};
  return (
    <div className="ks-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Replicas</h3>
      <Kv k="Desired" v={item.spec?.replicas ?? '-'} />
      <Kv k="Ready" v={`${s.readyReplicas ?? 0} / ${s.replicas ?? 0}`} />
      <Kv k="Available" v={s.availableReplicas ?? 0} />
      <Kv k="Updated" v={s.updatedReplicas ?? 0} />
    </div>
  );
}

function ServiceSpec({ item }: { item: any }) {
  const s = item.spec || {};
  return (
    <div className="ks-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Service</h3>
      <Kv k="Type" v={s.type} />
      <Kv k="Cluster IP" v={s.clusterIP} mono />
      <Kv k="Ports" v={(s.ports || []).map((p: any) => `${p.port}${p.targetPort ? `→${p.targetPort}` : ''}/${p.protocol || 'TCP'}`).join(', ') || '-'} mono />
      <Kv k="Selector" v={s.selector ? <Labels obj={s.selector} /> : '-'} />
      {item.status?.loadBalancer?.ingress && <Kv k="External" v={item.status.loadBalancer.ingress.map((i: any) => i.ip || i.hostname).join(', ')} mono />}
    </div>
  );
}

function NodeSpec({ item }: { item: any }) {
  const info = item.status?.nodeInfo || {};
  const ready = (item.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True';
  return (
    <div className="ks-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Node</h3>
      <Kv k="Ready" v={ready ? 'True' : 'False'} />
      <Kv k="Internal IP" v={(item.status?.addresses || []).find((a: any) => a.type === 'InternalIP')?.address || '-'} mono />
      <Kv k="OS" v={info.osImage || '-'} />
      <Kv k="Kubelet" v={info.kubeletVersion || '-'} mono />
      <Kv k="Runtime" v={info.containerRuntimeVersion || '-'} mono />
      <Kv k="CPU" v={item.status?.capacity?.cpu || '-'} mono />
      <Kv k="Memory" v={item.status?.capacity?.memory || '-'} mono />
      <Kv k="Pods" v={item.status?.capacity?.pods || '-'} />
    </div>
  );
}

function IngressSpec({ item }: { item: any }) {
  return (
    <div className="ks-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Rules</h3>
      {(item.spec?.rules || []).map((r: any, i: number) => (
        <div key={i} className="py-1.5 border-b border-base-800/60 last:border-0">
          <p className="font-mono text-sm text-accent-300">{r.host || '*'}</p>
          {(r.http?.paths || []).map((p: any, j: number) => (
            <p key={j} className="font-mono text-xs text-slate-400 mt-0.5">
              {p.path} → {p.backend?.service?.name}:{p.backend?.service?.port?.number || p.backend?.service?.port?.name}
            </p>
          ))}
        </div>
      ))}
      {item.status?.loadBalancer?.ingress && <Kv k="Address" v={item.status.loadBalancer.ingress.map((i: any) => i.ip || i.hostname).join(', ')} mono />}
    </div>
  );
}

function DataKeys({ item, secret }: { item: any; secret?: boolean }) {
  const keys = Object.keys(item.data || {});
  return (
    <div className="ks-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{secret ? `Secret (${item.type})` : 'Data'}</h3>
      {keys.length === 0 && <p className="text-sm text-slate-500">No data keys.</p>}
      {keys.map((k) => (
        <div key={k} className="py-1.5 border-b border-base-800/60 last:border-0">
          <p className="font-mono text-sm text-slate-200">{k}</p>
          {!secret && <p className="font-mono text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-all max-h-28 overflow-auto">{String(item.data[k]).slice(0, 2000)}</p>}
          {secret && <p className="text-xs text-slate-600">•••••• (hidden)</p>}
        </div>
      ))}
    </div>
  );
}

function ScaleDialog({ kind, namespace, name, current, onClose }: { kind: string; namespace: string; name: string; current: number; onClose: () => void }) {
  const { current: cluster } = useCluster();
  const qc = useQueryClient();
  const [replicas, setReplicas] = useState(current);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (kind === 'deployments') await k8s.scaleDeployment(cluster, namespace, name, replicas);
      else await k8s.scaleStatefulSet(cluster, namespace, name, replicas);
      qc.invalidateQueries();
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Scale ${name}`} onClose={onClose}>
      <label className="text-xs font-semibold text-slate-400 uppercase">Replicas: {replicas}</label>
      <input type="range" min={0} max={20} value={replicas} onChange={(e) => setReplicas(Number(e.target.value))} className="w-full mt-2 accent-sky-500" />
      <div className="flex justify-end gap-2 mt-5">
        <button className="ks-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="ks-btn-primary" disabled={saving} onClick={save}>{saving ? 'Scaling…' : 'Scale'}</button>
      </div>
    </Modal>
  );
}
