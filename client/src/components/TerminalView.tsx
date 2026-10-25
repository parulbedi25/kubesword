import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useCluster } from '../context/ClusterContext';
import { wsBase } from '../lib/utils';

export function TerminalView({ namespace, pod, container }: { namespace: string; pod: string; container?: string }) {
  const { current } = useCluster();
  const ref = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState('/bin/sh');
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: { background: '#00000000', foreground: '#e2e8f0', cursor: '#38bdf8' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();

    const url = `${wsBase()}/ws/exec?cluster=${encodeURIComponent(current)}&namespace=${encodeURIComponent(namespace)}&pod=${encodeURIComponent(pod)}${container ? `&container=${encodeURIComponent(container)}` : ''}&command=${encodeURIComponent(shell)}&cols=${term.cols}&rows=${term.rows}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => term.focus();
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') term.write(ev.data);
      else term.write(new Uint8Array(ev.data));
    };
    ws.onclose = () => term.write('\r\n\x1b[90m[connection closed — press Reconnect]\x1b[0m\r\n');
    const onData = term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(d));

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      onData.dispose();
      ws.close();
      term.dispose();
    };
  }, [current, namespace, pod, container, shell, key]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-700/60">
        <select className="ks-select !py-1.5 !text-xs" value={shell} onChange={(e) => { setShell(e.target.value); setKey((k) => k + 1); }}>
          <option value="/bin/sh">/bin/sh</option>
          <option value="/bin/bash">/bin/bash</option>
        </select>
        <button className="ks-btn-ghost !py-1.5 !text-xs" onClick={() => setKey((k) => k + 1)}>Reconnect</button>
        <span className="text-[11px] text-slate-500 ml-auto font-mono">{pod}</span>
      </div>
      <div ref={ref} className="flex-1 bg-black/70 min-h-[320px]" />
    </div>
  );
}
