import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Check, Upload } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { cn } from '../lib/utils';
import { Loading, ErrorBox } from '../components/ui';
import { AddClusterModal } from '../components/AddClusterModal';

export function Settings() {
  const { clusters, current, switchCluster, refresh } = useCluster();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [yaml, setYaml] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState('');

  const { data: info, isLoading, error, refetch } = useQuery({
    queryKey: ['info', current],
    queryFn: () => k8s.info(current),
  });

  const remove = async (name: string) => {
    if (!confirm(`Remove cluster "${name}" from KubeSword?\n(This only removes your local copy of its kubeconfig.)`)) return;
    setBusy(name);
    try {
      await k8s.deleteCluster(name);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    } finally {
      setBusy('');
    }
  };

  const apply = async () => {
    if (!yaml.trim()) return;
    setApplying(true);
    setApplyResult('');
    try {
      const res = await k8s.apply(current, yaml);
      const lines = (res.results || []).map((r: any) =>
        r.error ? `✗ ${r.kind}/${r.name}: ${r.error}` : `✓ ${r.kind}/${r.name}: ${r.action}`,
      );
      setApplyResult(lines.join('\n') || 'Nothing to apply.');
      setYaml('');
    } catch (e) {
      setApplyResult(`Apply failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-bold text-slate-100">Settings</h1>

      <div className="ks-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Clusters</h2>
          <button onClick={() => setAdding(true)} className="ks-btn-primary !py-1.5 !text-xs">
            <Plus className="w-4 h-4" /> Add cluster
          </button>
        </div>
        <div className="space-y-2">
          {clusters.map((c) => (
            <div
              key={c.name}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3',
                c.name === current ? 'border-accent-500/50 bg-accent-600/10' : 'border-base-700/60 bg-base-800/40',
              )}
            >
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', c.isDemo ? 'bg-amber-400' : 'bg-emerald-400')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-500 font-mono truncate">{c.server || ''}</p>
              </div>
              {c.name === current ? (
                <span className="inline-flex items-center gap-1 text-xs text-accent-300">
                  <Check className="w-3.5 h-3.5" /> Current
                </span>
              ) : (
                <button
                  className="ks-btn-ghost !py-1.5 !text-xs"
                  disabled={busy !== ''}
                  onClick={() => switchCluster(c.name).catch((e) => alert(e instanceof Error ? e.message : e))}
                >
                  Switch
                </button>
              )}
              {c.name !== 'demo' && (
                <button
                  onClick={() => remove(c.name)}
                  disabled={busy !== ''}
                  className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                  title={`Remove ${c.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {adding && <AddClusterModal onClose={() => { setAdding(false); refresh(); }} />}
      </div>

      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-1">Apply YAML</h2>
        <p className="text-sm text-slate-500 mb-3">
          Paste one or more manifests to create or update resources in <span className="font-mono text-slate-300">{current}</span>.
        </p>
        <textarea
          className="ks-input font-mono !text-xs h-48"
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          placeholder={'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n  namespace: default'}
          spellCheck={false}
        />
        {applyResult && (
          <pre className="mt-2 text-xs font-mono text-slate-300 bg-base-800/60 border border-base-700/60 rounded-lg p-3 whitespace-pre-wrap">
            {applyResult}
          </pre>
        )}
        <button onClick={apply} disabled={applying || !yaml.trim()} className="ks-btn-primary mt-3 disabled:opacity-60">
          <Upload className="w-4 h-4" /> {applying ? 'Applying…' : 'Apply to cluster'}
        </button>
      </div>

      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-3">Cluster info</h2>
        {isLoading ? (
          <Loading label="Loading cluster info…" />
        ) : error ? (
          <ErrorBox error={error} onRetry={() => refetch()} />
        ) : info ? (
          <dl className="text-sm space-y-1.5">
            {[
              ['Name', info.name],
              ['Server', info.server],
              ['Version', info.version],
              ['Demo mode', info.isDemo ? 'yes' : 'no'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
                <dd className="text-slate-200 font-mono text-[13px] break-all">{String(v ?? '-')}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
