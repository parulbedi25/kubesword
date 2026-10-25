import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { k8s, ApiError } from '../lib/api';
import { useCluster } from '../context/ClusterContext';
import { Modal } from './ui';

export function AddClusterModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [kubeconfig, setKubeconfig] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { switchCluster } = useCluster();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setKubeconfig(text);
    if (!name) setName(f.name.replace(/\.(yaml|yml|kubeconfig|config)$/i, '') || 'my-cluster');
  };

  const save = async () => {
    setError('');
    if (!kubeconfig.trim()) return setError('Paste a kubeconfig or choose a file.');
    setSaving(true);
    try {
      const res: any = await k8s.addCluster(name.trim() || 'my-cluster', kubeconfig);
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      const list = await k8s.clusters();
      const added: string | undefined = res.added;
      const target = list.clusters.find((c) => c.name === added)?.name
        || list.clusters.find((c) => c.name.startsWith(added || '___'))?.name;
      if (target) await switchCluster(target);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add cluster" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
          <input className="ks-input mt-1.5" placeholder="my-cluster" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kubeconfig file</label>
          <input
            type="file" accept=".yaml,.yml,.kubeconfig,.config,.txt"
            className="mt-1.5 block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-base-700 file:text-slate-200 hover:file:bg-base-600 file:cursor-pointer"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">…or paste kubeconfig YAML</label>
          <textarea
            className="ks-input mt-1.5 font-mono !text-xs h-48 resize-y"
            placeholder="apiVersion: v1&#10;kind: Config&#10;clusters: [...]"
            value={kubeconfig}
            onChange={(e) => setKubeconfig(e.target.value)}
            spellCheck={false}
          />
        </div>
        {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="ks-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ks-btn-primary" disabled={saving} onClick={save}>{saving ? 'Adding…' : 'Add cluster'}</button>
        </div>
        <p className="text-[11px] text-slate-600">Stored locally with restricted permissions and never leaves your machine in desktop mode.</p>
      </div>
    </Modal>
  );
}
