import { useState } from 'react';
import { k8s } from '../lib/api';
import { useCluster } from '../context/ClusterContext';
import { Modal } from './ui';

export function AddClusterModal({ onClose }: { onClose: () => void }) {
  const { refresh, switchCluster } = useCluster();
  const [name, setName] = useState('');
  const [kubeconfig, setKubeconfig] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim() || !kubeconfig.trim()) {
      setError('Cluster name and kubeconfig content are both required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await k8s.addCluster(name.trim(), kubeconfig);
      refresh();
      await switchCluster(name.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a cluster" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Paste the contents of a <span className="font-mono">kubeconfig</span> file. It is stored only on
          this machine (under <span className="font-mono">~/.kubesword/clusters/</span>) and never sent
          anywhere else.
        </p>
        <div>
          <label className="text-sm text-slate-300 font-medium">Cluster name</label>
          <input
            className="ks-input mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. production, staging, minikube"
          />
        </div>
        <div>
          <label className="text-sm text-slate-300 font-medium">kubeconfig (YAML)</label>
          <textarea
            className="ks-input mt-1.5 font-mono !text-xs h-64"
            value={kubeconfig}
            onChange={(e) => setKubeconfig(e.target.value)}
            placeholder="apiVersion: v1&#10;kind: Config&#10;clusters:&#10;  ..."
            spellCheck={false}
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="ks-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="ks-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Adding…' : 'Add cluster'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
