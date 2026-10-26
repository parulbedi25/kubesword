import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, ArrowDown, Search, Download } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { wsBase, cn } from '../lib/utils';

interface Props {
  namespace: string;
  pod: string;
  container?: string;
  height?: number;
}

const MAX_LINES = 1500; // cap rendered lines so noisy pods can't freeze the UI

export function LogsViewer({ namespace, pod, container, height = 480 }: Props) {
  const { current } = useCluster();
  const [text, setText] = useState('');
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('connecting…');
  const boxRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    setText('');
    setStatus('connecting…');
    const q = new URLSearchParams({ cluster: current, namespace, pod, tailLines: '500' });
    if (container) q.set('container', container);
    let ws: WebSocket | null = null;
    let dead = false;

    try {
      ws = new WebSocket(`${wsBase()}/ws/logs?${q.toString()}`);
    } catch (e) {
      setStatus(`failed: ${e instanceof Error ? e.message : e}`);
      return;
    }

    const append = (chunk: string) => {
      if (pausedRef.current) return;
      setText((prev) => {
        const next = prev + chunk;
        // Trim from the front, keeping whole lines.
        const lines = next.split('\n');
        if (lines.length > MAX_LINES) return lines.slice(lines.length - MAX_LINES).join('\n');
        return next;
      });
    };

    ws.onopen = () => !dead && setStatus('streaming');
    ws.onmessage = (ev) => {
      if (dead || typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'stdout' || msg.type === 'stderr') append(msg.data || '');
        else if (msg.type === 'error') setStatus(`error: ${msg.data || 'unknown'}`);
        else if (msg.type === 'exit') setStatus('stream ended');
      } catch {
        append(ev.data); // raw text fallback
      }
    };
    ws.onerror = () => !dead && setStatus('connection failed');
    ws.onclose = () => !dead && setStatus((s) => (s === 'streaming' ? 'closed' : s));

    return () => {
      dead = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [current, namespace, pod, container]);

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [text, follow]);

  const lines = useMemo(() => {
    const all = text.split('\n');
    const q = filter.trim().toLowerCase();
    const shown = q ? all.filter((l) => l.toLowerCase().includes(q)) : all;
    return shown.slice(-MAX_LINES).join('\n');
  }, [text, filter]);

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pod}${container ? `-${container}` : ''}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => setPaused(!paused)} className="ks-btn-ghost !py-1.5 !text-xs">
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => setFollow(!follow)}
          className={cn('ks-btn-ghost !py-1.5 !text-xs', follow && '!text-accent-300 !border-accent-500/40')}
        >
          <ArrowDown className="w-3.5 h-3.5" /> Follow
        </button>
        <div className="relative flex-1 min-w-[140px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="ks-input !py-1.5 !text-xs pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter lines…"
          />
        </div>
        <button onClick={download} className="ks-btn-ghost !py-1.5 !text-xs" title="Download full log">
          <Download className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-500">{status}</span>
      </div>
      <div
        ref={boxRef}
        style={{ height }}
        className="rounded-lg border border-base-700/60 bg-[#0a0f1e] p-3 overflow-auto font-mono text-[12px] leading-relaxed text-slate-300 whitespace-pre-wrap break-all"
      >
        {lines || <span className="text-slate-600">Waiting for log output…</span>}
      </div>
    </div>
  );
}
