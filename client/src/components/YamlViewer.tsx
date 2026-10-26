import React, { Suspense, useState } from 'react';
import { Download, Pencil, Check, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { lazyWithRetry } from '../lib/lazyRetry';
import { Loading, ErrorBox } from './ui';

// Monaco is the only code-split chunk (~5 MB, loaded on demand). Both the
// loader config AND the editor import must be dynamic — a static import of
// '../lib/monaco' would drag all of monaco-editor into the main bundle.
const Editor = lazyWithRetry(() =>
  import('../lib/monaco').then(() =>
    import('@monaco-editor/react').then((m) => ({ default: m.default })),
  ),
);

interface Props {
  kind: string;
  namespace: string;
  name: string;
  height?: number;
}

export function YamlViewer({ kind, namespace, name, height = 480 }: Props) {
  const { current } = useCluster();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['yaml', current, kind, namespace, name],
    queryFn: () => k8s.yaml(current, kind, namespace, name),
  });

  const text = typeof data === 'string' ? data : '';
  const shown = draft ?? text;

  const download = () => {
    const blob = new Blob([shown], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await k8s.apply(current, draft ?? text);
      const first = res.results?.[0];
      if (first?.error) setSaveMsg(`Apply failed: ${first.error}`);
      else {
        setSaveMsg('Applied successfully.');
        setEditing(false);
        setDraft(null);
        qc.invalidateQueries({ queryKey: ['yaml'] });
      }
    } catch (e) {
      setSaveMsg(`Apply failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loading label="Loading YAML…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {!editing ? (
          <button onClick={() => { setEditing(true); setDraft(text); }} className="ks-btn-ghost !py-1.5 !text-xs">
            <Pencil className="w-3.5 h-3.5" /> Edit & apply
          </button>
        ) : (
          <>
            <button onClick={save} disabled={saving} className="ks-btn-primary !py-1.5 !text-xs disabled:opacity-60">
              <Check className="w-3.5 h-3.5" /> {saving ? 'Applying…' : 'Apply changes'}
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(null); setSaveMsg(''); }}
              className="ks-btn-ghost !py-1.5 !text-xs"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </>
        )}
        <button onClick={download} className="ks-btn-ghost !py-1.5 !text-xs" title="Download YAML">
          <Download className="w-3.5 h-3.5" />
        </button>
        {saveMsg && <span className="text-xs text-slate-400">{saveMsg}</span>}
      </div>
      <div className="rounded-lg overflow-hidden border border-base-700/60">
        <Suspense fallback={<Loading label="Loading editor…" />}>
          <Editor
            height={height}
            language="yaml"
            theme="vs-dark"
            value={shown}
            onChange={(v) => editing && setDraft(v ?? '')}
            options={{ readOnly: !editing, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true }}
          />
        </Suspense>
      </div>
    </div>
  );
}
