import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, Boxes, Layers, Network as NetIcon, Plug, FileCode2,
  HardDrive, ShieldCheck, FolderOpen, AlertTriangle, Settings, ChevronDown,
  RefreshCw, Plus, Radio, Trash2,
} from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { cn } from '../lib/utils';
import { k8s } from '../lib/api';
import { ErrorBoundary } from './ErrorBoundary';
import { AddClusterModal } from './AddClusterModal';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/nodes', label: 'Nodes', icon: Server },
  { to: '/namespaces', label: 'Namespaces', icon: FolderOpen },
  { to: '/pods', label: 'Pods', icon: Boxes },
  { to: '/workloads', label: 'Workloads', icon: Layers },
  { to: '/network', label: 'Network', icon: NetIcon },
  { to: '/port-forwards', label: 'Port Forwards', icon: Plug },
  { to: '/config', label: 'Config', icon: FileCode2 },
  { to: '/storage', label: 'Storage', icon: HardDrive },
  { to: '/rbac', label: 'Access (RBAC)', icon: ShieldCheck },
  { to: '/events', label: 'Events', icon: AlertTriangle },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function ClusterSwitcher() {
  const { clusters, current, isDemo, switchCluster, refresh } = useCluster();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (name: string) => {
    if (name === current) return setOpen(false);
    setBusy(true);
    try {
      await switchCluster(name);
    } catch (e) {
      alert(`Could not switch cluster: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`Remove cluster "${name}" from KubeSword?\n(This only removes your local copy of its kubeconfig.)`)) return;
    setBusy(true);
    try {
      await k8s.deleteCluster(name);
      refresh();
    } catch (e) {
      alert(`Could not remove cluster: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-base-800 hover:bg-base-700/80 border border-base-700 transition-colors text-left disabled:opacity-60"
      >
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', isDemo ? 'bg-amber-400' : 'bg-emerald-400')} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-100 truncate">{current}</span>
          <span className="block text-[11px] text-slate-500">{isDemo ? 'Demo cluster' : 'Live cluster'}</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1.5 z-20 ks-card overflow-hidden">
            <div className="max-h-64 overflow-auto py-1">
              {clusters.map((c) => (
                <div
                  key={c.name}
                  className={cn('group flex items-center gap-2 px-3 py-2 hover:bg-base-800', c.name === current && 'bg-base-800/60')}
                >
                  <button onClick={() => pick(c.name)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', c.isDemo ? 'bg-amber-400' : 'bg-emerald-400')} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-200 truncate">{c.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{c.server || ''}</span>
                    </span>
                  </button>
                  {c.name !== 'demo' && (
                    <button
                      onClick={() => remove(c.name)}
                      title={`Remove ${c.name}`}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-base-700/60 p-2 flex gap-1">
              <button onClick={() => { setAdding(true); setOpen(false); }} className="ks-btn-ghost !py-1.5 flex-1 !justify-center">
                <Plus className="w-3.5 h-3.5" /> Add cluster
              </button>
              <button onClick={() => { refresh(); setOpen(false); }} className="ks-btn-ghost !py-1.5" title="Reload clusters">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
      {adding && <AddClusterModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  return (
    <aside className="w-60 shrink-0 border-r border-base-800 bg-base-900/60 flex flex-col h-screen sticky top-0">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 px-1 pb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center font-bold text-white">
            K
          </div>
          <div>
            <p className="font-bold text-slate-100 leading-none">KubeSword</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Kubernetes Console</p>
          </div>
        </div>
        <ClusterSwitcher />
      </div>
      <nav className="flex-1 overflow-auto px-3 pb-3 space-y-0.5">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end as any}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive || (!n.end && location.pathname === n.to)
                  ? 'bg-accent-600/20 text-accent-200 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-base-800',
              )
            }
          >
            <n.icon className="w-4 h-4 shrink-0" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-base-800">
        <p className="text-[11px] text-slate-600">KubeSword · local-first k8s UI</p>
      </div>
    </aside>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { isDemo, refresh, current } = useCluster();
  const [spinning, setSpinning] = useState(false);

  const onRefresh = () => {
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 800);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {isDemo && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-[13px]">
            <Radio className="w-4 h-4 shrink-0" />
            <span>
              Viewing the <strong>built-in demo cluster</strong> — connect a real cluster via the switcher above
              or Settings.
            </span>
          </div>
        )}
        <header className="flex items-center justify-between px-5 py-3 border-b border-base-800 sticky top-0 bg-base-950/85 backdrop-blur z-10">
          <p className="text-sm text-slate-500">
            Cluster <span className="text-slate-200 font-medium font-mono">{current}</span>
          </p>
          <button onClick={onRefresh} className="ks-btn-ghost !py-1.5" title="Refresh all data (Ctrl+Shift+R)">
            <RefreshCw className={cn('w-4 h-4', spinning && 'animate-spin')} /> Refresh
          </button>
        </header>
        <main className="flex-1 p-5 max-w-[1500px] w-full mx-auto">
          <ErrorBoundary title="This section crashed">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
