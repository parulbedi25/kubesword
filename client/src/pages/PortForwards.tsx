import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Square, ExternalLink } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Loading, ErrorBox, EmptyState, Modal } from '../components/ui';

export function PortForwards() {
  const { current, isDemo } = useCluster();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ['portforwards', current],
    queryFn: () => k8s.portForwards(current),
    refetchInterval: 5000,
  });

  const stop = async (id: string) => {
    await k8s.stopPortForward(current, id);
    qc.invalidateQueries({ queryKey: ['portforwards', current] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-100">Port Forwards</h1>
        <div className="flex-1" />
        {!isDemo && (
          <button className="ks-btn-primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New forward</button>
        )}
      </div>

      {isDemo && (
        <div className="ks-card p-4 text-sm text-amber-300 bg-amber-500/5 border-amber-500/30">
          Port forwarding is disabled in the demo cluster. Connect a real cluster to forward pod ports to your machine.
        </div>
      )}

      {query.isLoading ? <Loading /> : query.isError ? <ErrorBox error={query.error} /> : (
        <div className="ks-card overflow-auto">
          <table className="ks-table w-full">
            <thead>
              <tr className="bg-base-850/60">
                <th>Pod</th><th>Namespace</th><th>Pod port</th><th>Local</th><th>Started</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.items || []).map((pf: any) => (
                <tr key={pf.id}>
                  <td><span className="font-mono text-[13px] text-slate-100">{pf.pod}</span></td>
                  <td><span className="text-slate-400">{pf.namespace}</span></td>
                  <td><span className="font-mono text-slate-300">{pf.podPort}</span></td>
                  <td>
                    <a className="font-mono text-[13px] text-accent-300 hover:underline inline-flex items-center gap-1"
                      href={`http://127.0.0.1:${pf.localPort}`} target="_blank" rel="noreferrer">
                      127.0.0.1:{pf.localPort} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td><span className="text-slate-400">{timeAgo(pf.startedAt)}</span></td>
                  <td>
                    <button className="ks-btn-danger !py-1.5 !text-xs" onClick={() => stop(pf.id)}>
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(query.data?.items || []).length === 0 && <EmptyState title="No active port forwards" hint="Forward a pod port to access it on localhost." />}
        </div>
      )}

      {open && <NewForwardModal onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['portforwards', current] }); }} />}
    </div>
  );
}

function NewForwardModal({ onClose }: { onClose: () => void }) {
  const { current } = useCluster();
  const [namespace, setNamespace] = useState('default');
  const [pod, setPod] = useState('');
  const [podPort, setPodPort] = useState(8080);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const pods = useQuery({ queryKey: ['list', current, 'pods', namespace], queryFn: () => k8s.list(current, 'pods', namespace) });
  const nss = useQuery({ queryKey: ['list', current, 'namespaces', 'all'], queryFn: () => k8s.list(current, 'namespaces', 'all') });

  const save = async () => {
    setError('');
    if (!pod) return setError('Select a pod.');
    setSaving(true);
    try {
      await k8s.startPortForward(current, { namespace, pod, podPort: Number(podPort) });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New port forward" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Namespace</label>
          <select className="ks-select w-full mt-1.5" value={namespace} onChange={(e) => setNamespace(e.target.value)}>
            {(nss.data?.items || []).map((n: any) => <option key={n.metadata?.name} value={n.metadata?.name}>{n.metadata?.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Pod</label>
          <select className="ks-select w-full mt-1.5" value={pod} onChange={(e) => setPod(e.target.value)}>
            <option value="">Select pod…</option>
            {(pods.data?.items || []).map((p: any) => <option key={p.metadata?.name} value={p.metadata?.name}>{p.metadata?.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Pod port</label>
          <input className="ks-input mt-1.5" type="number" value={podPort} onChange={(e) => setPodPort(Number(e.target.value))} />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="ks-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ks-btn-primary" disabled={saving} onClick={save}>{saving ? 'Starting…' : 'Start forward'}</button>
        </div>
      </div>
    </Modal>
  );
}
