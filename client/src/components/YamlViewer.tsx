import React, { useState, Suspense, lazy } from 'react';
const Editor = lazy(() => import('./MonacoEditor'));
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Save } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { Loading, ErrorBox } from './ui';

export function YamlViewer({ kind, namespace, name }: { kind: string; namespace: string; name: string }) {
  const { current, isDemo } = useCluster();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const query = useQuery({
    queryKey: ['yaml', current, kind, namespace, name],
    queryFn: () => k8s.yaml(current, kind, namespace, name),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;

  const value = edited ?? (query.data as string);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    if (edited == null) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await k8s.apply(current, edited);
      const failed = res.results.filter((r: any) => r.status === 'failed');
      setMsg(failed.length ? `Failed: ${failed.map((f: any) => f.error).join('; ')}` : 'Applied successfully');
      qc.invalidateQueries();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-700/60">
        <span className="text-xs text-slate-500 font-mono">{kind}/{name}.yaml</span>
        <div className="flex-1" />
        <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
        </button>
        {!isDemo && (
          <button className="ks-btn-primary !py-1.5 !text-xs" disabled={edited == null || saving} onClick={save}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'Applying…' : 'Apply'}
          </button>
        )}
        {edited != null && <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={() => setEdited(null)}>Reset</button>}
      </div>
      {msg && <div className="px-4 py-1.5 text-xs bg-base-800 text-slate-300 border-b border-base-700/60">{msg}</div>}
      <div className="min-h-[400px]">
        <Suspense fallback={<Loading label="Loading editor…" />}>
          <Editor
            height="480px"
            language="yaml"
            theme="vs-dark"
            value={value}
            onChange={(v) => setEdited(v ?? '')}
            options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, wordWrap: 'on' }}
          />
        </Suspense>
      </div>
    </div>
  );
}
