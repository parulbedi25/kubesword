import React, { useState, Suspense, lazy } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileUp, Check } from 'lucide-react';
const Editor = lazy(() => import('../components/MonacoEditor'));
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { Loading } from '../components/ui';
import { AddClusterModal } from '../components/AddClusterModal';

export function Settings() {
  const { current, clusters, switchCluster, isDemo } = useCluster();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [yamlText, setYamlText] = useState('apiVersion: v1\nkind: Namespace\nmetadata:\n  name: hello-kubesword\n');
  const [applyMsg, setApplyMsg] = useState('');
  const [applying, setApplying] = useState(false);

  const info = useQuery({ queryKey: ['info', current], queryFn: () => k8s.info(current) });

  const remove = async (name: string) => {
    if (!confirm(`Remove cluster "${name}"?`)) return;
    await k8s.deleteCluster(name);
    qc.invalidateQueries();
  };

  const apply = async () => {
    setApplying(true);
    setApplyMsg('');
    try {
      const res = await k8s.apply(current, yamlText);
      const failed = res.results.filter((r: any) => r.status === 'failed');
      setApplyMsg(failed.length ? `Some failed: ${failed.map((f: any) => `${f.kind}/${f.name}: ${f.error}`).join('; ')}` : `Applied ${res.results.length} object(s) ✓`);
      qc.invalidateQueries();
    } catch (e: any) {
      setApplyMsg(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-bold text-slate-100">Settings</h1>

      <div className="ks-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-slate-200">Clusters</h2>
          <div className="flex-1" />
          <button className="ks-btn-primary !py-1.5 !text-xs" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" /> Add cluster</button>
        </div>
        {info.isLoading ? <Loading /> : (
          <p className="text-xs text-slate-500 mb-3 font-mono">
            current: {current} · server: {info.data?.server} · version: {info.data?.version?.gitVersion}
          </p>
        )}
        <div className="space-y-2">
          {clusters.map((c) => (
            <div key={c.name} className="flex items-center gap-3 bg-base-800/60 border border-base-700/50 rounded-lg px-3 py-2.5">
              <span className={`w-2 h-2 rounded-full ${c.isDemo ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200 truncate font-medium">{c.name}</p>
                <p className="text-[11px] text-slate-500 truncate font-mono">{c.server}</p>
              </div>
              {c.name === current
                ? <span className="text-xs text-accent-300 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> current</span>
                : <button className="ks-btn-ghost !py-1 !text-xs" onClick={() => switchCluster(c.name)}>Switch</button>}
              {!c.isDemo && (
                <button className="text-slate-500 hover:text-red-300 p-1" onClick={() => remove(c.name)} title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ks-card p-5">
        <h2 className="font-semibold text-slate-200 mb-1 flex items-center gap-2"><FileUp className="w-4 h-4" /> Apply YAML</h2>
        <p className="text-xs text-slate-500 mb-3">kubectl-apply style. Supports multi-document YAML.{isDemo && ' Disabled in demo.'}</p>
        <div className="border border-base-600 rounded-lg overflow-hidden">
          <Suspense fallback={<Loading label="Loading editor…" />}>
            <Editor height="260px" language="yaml" theme="vs-dark" value={yamlText} onChange={(v) => setYamlText(v ?? '')} options={{ minimap: { enabled: false }, fontSize: 12 }} />
          </Suspense>
        </div>
        {applyMsg && <p className="text-xs mt-2 font-mono text-slate-300 bg-base-800 rounded-lg px-3 py-2">{applyMsg}</p>}
        <div className="flex justify-end mt-3">
          <button className="ks-btn-primary" disabled={isDemo || applying} onClick={apply}>{applying ? 'Applying…' : 'Apply to cluster'}</button>
        </div>
      </div>

      <div className="ks-card p-5">
        <h2 className="font-semibold text-slate-200 mb-2">About</h2>
        <p className="text-sm text-slate-400">
          <span className="text-slate-200 font-semibold">KubeSword v1.0.0</span> — a web-based Kubernetes monitoring &amp; management tool.
          Runs in any browser (<span className="font-mono">npm run web</span> / Docker) and as a desktop app for Windows (.exe), macOS (.dmg) and Linux (.deb).
        </p>
        <p className="text-xs text-slate-600 mt-2">Shortcuts: Ctrl/⌘+Shift+R refreshes all data · Esc closes panels.</p>
      </div>

      {showAdd && <AddClusterModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
