import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso?: string): string {
  if (!iso) return '-';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? `${m % 60}m` : ''}`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d${h % 24 ? `${h % 24}h` : ''}`;
  return `${Math.floor(d / 365)}y${Math.floor((d % 365) / 30)}mo`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function podStatus(pod: any): { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'gray' } {
  const phase = pod?.status?.phase || 'Unknown';
  const waiting = (pod?.status?.containerStatuses || []).find((c: any) => c.state?.waiting);
  const terminated = (pod?.status?.containerStatuses || []).find((c: any) => c.state?.terminated && c.state.terminated.exitCode !== 0);
  if (terminated) return { label: terminated.state.terminated.reason || 'Error', tone: 'red' };
  if (waiting) {
    const r = waiting.state.waiting.reason || 'Waiting';
    return { label: r, tone: r === 'ContainerCreating' ? 'yellow' : 'red' };
  }
  if (phase === 'Running') {
    const ready = (pod?.status?.containerStatuses || []).every((c: any) => c.ready);
    return ready ? { label: 'Running', tone: 'green' } : { label: 'NotReady', tone: 'yellow' };
  }
  if (phase === 'Succeeded') return { label: 'Succeeded', tone: 'blue' };
  if (phase === 'Pending') return { label: 'Pending', tone: 'yellow' };
  if (phase === 'Failed') return { label: 'Failed', tone: 'red' };
  return { label: phase, tone: 'gray' };
}

export function restarts(pod: any): number {
  return (pod?.status?.containerStatuses || []).reduce((a: number, c: any) => a + (c.restartCount || 0), 0);
}

export function readyCount(pod: any): string {
  const list = pod?.status?.containerStatuses || [];
  return `${list.filter((c: any) => c.ready).length}/${list.length || pod?.spec?.containers?.length || 0}`;
}

export function toneClasses(tone: string): string {
  switch (tone) {
    case 'green': return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    case 'yellow': return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    case 'red': return 'bg-red-500/15 text-red-300 border border-red-500/30';
    case 'blue': return 'bg-sky-500/15 text-sky-300 border border-sky-500/30';
    default: return 'bg-slate-500/15 text-slate-300 border border-slate-500/30';
  }
}

export function cpuToMillis(cpu?: string): number {
  if (!cpu) return 0;
  if (cpu.endsWith('m')) return parseInt(cpu);
  if (cpu.endsWith('n')) return parseInt(cpu) / 1e6;
  return parseFloat(cpu) * 1000;
}

export function memToMi(mem?: string): number {
  if (!mem) return 0;
  const m = mem.match(/^([\d.]+)([A-Za-z]*)$/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const u = m[2];
  const table: Record<string, number> = {
    Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1024 * 1024,
    K: 1 / 1024, M: 1, G: 1024, '': 1 / (1024 * 1024),
  };
  return v * (table[u] ?? 0);
}

export function wsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}
