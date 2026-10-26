import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso?: string): string {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const s = Math.floor((Date.now() - t) / 1000);
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
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

export type Tone = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

export function podStatus(pod: any): { label: string; tone: Tone } {
  const phase = pod?.status?.phase || 'Unknown';
  const statuses: any[] = pod?.status?.containerStatuses || [];
  const terminated = statuses.find((c) => c.state?.terminated && c.state.terminated.exitCode !== 0);
  if (terminated) return { label: terminated.state.terminated.reason || 'Error', tone: 'red' };
  const waiting = statuses.find((c) => c.state?.waiting);
  if (waiting) {
    const r = waiting.state.waiting.reason || 'Waiting';
    return { label: r, tone: r === 'ContainerCreating' ? 'yellow' : 'red' };
  }
  if (phase === 'Running') {
    const ready = statuses.length > 0 && statuses.every((c) => c.ready);
    return ready ? { label: 'Running', tone: 'green' } : { label: 'NotReady', tone: 'yellow' };
  }
  if (phase === 'Succeeded') return { label: 'Succeeded', tone: 'blue' };
  if (phase === 'Pending') return { label: 'Pending', tone: 'yellow' };
  if (phase === 'Failed') return { label: 'Failed', tone: 'red' };
  return { label: String(phase), tone: 'gray' };
}

export function restarts(pod: any): number {
  return (pod?.status?.containerStatuses || []).reduce((a: number, c: any) => a + (c.restartCount || 0), 0);
}

export function readyCount(pod: any): string {
  const list = pod?.status?.containerStatuses || [];
  const total = list.length || pod?.spec?.containers?.length || 0;
  return `${list.filter((c: any) => c.ready).length}/${total}`;
}

export function toneClasses(tone: string): string {
  switch (tone) {
    case 'green':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    case 'yellow':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    case 'red':
      return 'bg-red-500/15 text-red-300 border border-red-500/30';
    case 'blue':
      return 'bg-sky-500/15 text-sky-300 border border-sky-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/30';
  }
}

export function wsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}
