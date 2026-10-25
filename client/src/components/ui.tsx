import React from 'react';
import { Loader2, Search, Inbox } from 'lucide-react';
import { cn, toneClasses } from '../lib/utils';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="ks-card p-6 text-center">
      <p className="text-red-300 text-sm font-medium">Failed to load</p>
      <p className="text-slate-400 text-sm mt-1 font-mono break-all">{msg}</p>
      {onRetry && <button className="ks-btn-ghost mt-4" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function EmptyState({ title = 'No resources found', hint }: { title?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-base-800 flex items-center justify-center mb-3">
        <Inbox className="w-6 h-6 text-slate-500" />
      </div>
      <p className="font-medium text-slate-300">{title}</p>
      {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input className="ks-input pl-9 !w-64" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Badge({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  return <span className={cn('ks-badge', toneClasses(tone), className)}>{children}</span>;
}

export function StatCard({ label, value, sub, icon, accent = 'text-accent-400' }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <div className="ks-card p-4 flex items-start gap-3">
      {icon && <div className={cn('mt-0.5', accent)}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
        <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative ks-card w-full shadow-2xl max-h-[90vh] flex flex-col', wide ? 'max-w-5xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-700/60">
          <h2 className="font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none px-1">×</button>
        </div>
        <div className="p-5 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-base-900 border-l border-base-700 shadow-2xl flex flex-col animate-in">
        <div className="flex items-start justify-between px-5 py-4 border-b border-base-700/60">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-100 truncate font-mono text-sm">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none px-1 shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-base-700/60 px-5 bg-base-900/50 sticky top-0 z-10">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === t.id ? 'border-accent-500 text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-300'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-36 shrink-0 text-slate-500">{k}</span>
      <span className={cn('text-slate-200 break-all', mono && 'font-mono text-[13px]')}>{v}</span>
    </div>
  );
}
