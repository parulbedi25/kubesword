import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Pause, Play, Trash2 } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { wsBase } from '../lib/utils';

export function LogsViewer({ namespace, pod, container }: { namespace: string; pod: string; container?: string }) {
  const { current } = useCluster();
  const [follow, setFollow] = useState(true);
  const [streamed, setStreamed] = useState('');
  const [filter, setFilter] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const snapshot = useQuery({
    queryKey: ['logs', current, namespace, pod, container],
    queryFn: () => k8s.podLogs(current, namespace, pod, container, 500),
    refetchInterval: false,
  });

  useEffect(() => {
    setStreamed('');
  }, [current, namespace, pod, container]);

  useEffect(() => {
    if (!follow) return;
    const url = `${wsBase()}/ws/logs?cluster=${encodeURIComponent(current)}&namespace=${encodeURIComponent(namespace)}&pod=${encodeURIComponent(pod)}${container ? `&container=${encodeURIComponent(container)}` : ''}&tailLines=200`;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => setStreamed((s) => (s + ev.data).slice(-200000));
    return () => ws.close();
  }, [follow, current, namespace, pod, container]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [streamed, follow]);

  const text = follow ? streamed : snapshot.data || '';
  const lines = useMemo(
    () => text.split('\n').filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase())),
    [text, filter],
  );
  // Never render more than this many log divs — chatty containers can emit
  // thousands of lines and freeze the tab. Download still gets everything.
  const MAX_RENDER_LINES = 1500;
  const rendered = lines.length > MAX_RENDER_LINES ? lines.slice(-MAX_RENDER_LINES) : lines;
  const hidden = lines.length - rendered.length;

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pod}${container ? '-' + container : ''}.log`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-700/60">
        <input className="ks-input !py-1.5 !text-xs" placeholder="Filter logs…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="ks-btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => setFollow(!follow)} title={follow ? 'Pause stream' : 'Resume stream'}>
          {follow ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {follow ? 'Live' : 'Paused'}
        </button>
        <button className="ks-btn-ghost !px-2.5 !py-1.5" onClick={() => setStreamed('')} title="Clear"><Trash2 className="w-3.5 h-3.5" /></button>
        <button className="ks-btn-ghost !px-2.5 !py-1.5" onClick={download} title="Download"><Download className="w-3.5 h-3.5" /></button>
      </div>
      <div ref={boxRef} className="flex-1 overflow-auto bg-black/60 p-3 font-mono text-[12px] leading-relaxed min-h-[300px] max-h-[520px]">
        {snapshot.isLoading && !streamed ? (
          <span className="text-slate-500">Loading logs…</span>
        ) : lines.length === 0 ? (
          <span className="text-slate-500">No log lines.</span>
        ) : (
          <>
            {hidden > 0 && (
              <div className="text-amber-300/80 italic mb-1">
                … {hidden.toLocaleString()} older lines hidden (use Download for the full log)
              </div>
            )}
            {rendered.map((l, i) => <LogLine key={i} line={l} />)}
          </>
        )}
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  let cls = 'text-slate-300';
  if (/\b(ERROR|Error|error|FATAL|panic|CrashLoop)\b/.test(line)) cls = 'text-red-300';
  else if (/\b(WARN|Warn|warning)\b/.test(line)) cls = 'text-amber-300';
  else if (/\b(INFO|info)\b/.test(line)) cls = 'text-slate-300';
  else if (/\b(DEBUG|debug)\b/.test(line)) cls = 'text-slate-500';
  else if (/^\[/.test(line)) cls = 'text-slate-300';
  return <div className={`${cls} whitespace-pre-wrap break-all`}>{line || ' '}</div>;
}
