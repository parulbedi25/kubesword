import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useCluster } from '../context/ClusterContext';
import { wsBase } from '../lib/utils';

interface Props {
  namespace: string;
  pod: string;
  container?: string;
  height?: number;
}

export function TerminalView({ namespace, pod, container, height = 480 }: Props) {
  const { current } = useCluster();
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: { background: '#0a0f1e', foreground: '#e2e8f0', cursor: '#818cf8' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    // Defer fit so the drawer has finished laying out.
    const fitTimer = setTimeout(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    }, 60);

    const q = new URLSearchParams({ cluster: current, namespace, pod });
    if (container) q.set('container', container);
    let ws: WebSocket | null = null;
    let dead = false;

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', onResize);

    try {
      ws = new WebSocket(`${wsBase()}/ws/exec?${q.toString()}`);
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    ws.onopen = () => {
      if (dead) return ws.close();
      setStatus('open');
      onResize();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'stderr' || msg.type === 'stdout') term.write(msg.data || '');
          else if (msg.type === 'error') {
            term.writeln(`\r\n\x1b[31m${msg.data || 'exec error'}\x1b[0m`);
            setErrMsg(String(msg.data || 'exec error'));
          } else if (msg.type === 'exit') {
            term.writeln(`\r\n\x1b[33m[process exited, code ${msg.code ?? '?'}]\x1b[0m`);
          }
          return;
        } catch {
          /* not JSON — write raw */
        }
        term.write(ev.data);
      } else {
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onerror = () => {
      if (!dead) {
        setStatus('error');
        setErrMsg('WebSocket connection failed.');
      }
    };
    ws.onclose = () => {
      if (!dead) setStatus('closed');
    };

    const dataDisp = term.onData((d) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stdin', data: d }));
    });

    const keyDisp = term.onKey(({ domEvent }) => {
      if (domEvent.key === 'Escape') domEvent.stopPropagation(); // don't close the drawer
    });

    return () => {
      dead = true;
      clearTimeout(fitTimer);
      window.removeEventListener('resize', onResize);
      dataDisp.dispose();
      keyDisp.dispose();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
  }, [current, namespace, pod, container]);

  return (
    <div>
      <div ref={hostRef} style={{ height }} className="rounded-lg overflow-hidden border border-base-700/60 bg-[#0a0f1e] p-2" />
      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
        <span
          className={
            'w-2 h-2 rounded-full ' +
            (status === 'open' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400')
          }
        />
        {status === 'open' && 'Connected — type to interact with the container shell.'}
        {status === 'connecting' && 'Connecting to container…'}
        {status === 'closed' && 'Session closed.'}
        {status === 'error' && <span className="text-red-300">{errMsg || 'Connection failed.'}</span>}
      </div>
    </div>
  );
}
