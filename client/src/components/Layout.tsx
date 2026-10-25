import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Box, Layers, Network, Database, FileCog, ShieldCheck,
  ScrollText, FolderKanban, Settings, ChevronDown, Plus, RefreshCw, Radio,
  ArrowLeftRight, Menu, X, Sparkles, TerminalSquare,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { cn } from '../lib/utils';
import { AddClusterModal } from './AddClusterModal';

const NAV = [
  { section: 'Cluster' },
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/nodes', label: 'Nodes', icon: Server },
  { to: '/namespaces', label: 'Namespaces', icon: FolderKanban },
  { to: '/events', label: 'Events', icon: ScrollText },
  { section: 'Workloads' },
  { to: '/pods', label: 'Pods', icon: Box },
  { to: '/workloads', label: 'Deployments & Jobs', icon: Layers },
  { section: 'Network' },
  { to: '/network', label: 'Services & Ingress', icon: Network },
  { to: '/port-forwards', label: 'Port Forwards', icon: ArrowLeftRight },
  { section: 'Config & Storage' },
  { to: '/config', label: 'Config & Secrets', icon: FileCog },
  { to: '/storage', label: 'Storage', icon: Database },
  { to: '/rbac', label: 'RBAC', icon: ShieldCheck },
  { section: 'System' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { current, clusters, isDemo, switchCluster, refresh } = useCluster();
  const [showClusters, setShowClusters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = useNavigate();

  const { data: info } = useQuery({ queryKey: ['info', current], queryFn: () => k8s.info(current) });

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-600/30">
          <TerminalSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-extrabold text-slate-100 leading-none tracking-tight">KubeSword</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Kubernetes Monitor</p>
        </div>
      </div>

      {/* Cluster switcher */}
      <div className="px-3 pb-3 relative">
        <button
          onClick={() => setShowClusters(!showClusters)}
          className="w-full flex items-center gap-2 bg-base-800 hover:bg-base-750 border border-base-600 rounded-lg px-3 py-2.5 text-left transition-colors"
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', isDemo ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse')} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-200 truncate">{current}</span>
            <span className="block text-[11px] text-slate-500 truncate">{info?.version?.gitVersion || clusters.find(c => c.name === current)?.server || ''}</span>
          </span>
          <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform', showClusters && 'rotate-180')} />
        </button>
        {showClusters && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowClusters(false)} />
            <div className="absolute left-3 right-3 top-full -mt-1 z-20 ks-card shadow-2xl overflow-hidden">
              <div className="max-h-64 overflow-auto py-1">
                {clusters.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => { switchCluster(c.name); setShowClusters(false); nav('/'); }}
                    className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-800', c.name === current && 'bg-base-800/70')}
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', c.isDemo ? 'bg-amber-400' : 'bg-emerald-400')} />
                    <span className="flex-1 truncate text-slate-200">{c.name}</span>
                    {c.isDemo && <span className="text-[10px] uppercase font-bold text-amber-400/80">demo</span>}
                    {c.name === current && <span className="text-accent-400 text-xs">●</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowClusters(false); setShowAdd(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-accent-400 hover:bg-base-800 border-t border-base-700/60"
              >
                <Plus className="w-4 h-4" /> Add cluster (kubeconfig)
              </button>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-auto px-2 pb-4">
        {NAV.map((item: any, i) =>
          item.section ? (
            <p key={i} className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-bold">{item.section}</p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5',
                isActive ? 'bg-accent-600/15 text-accent-300 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-base-800/70'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="p-3 border-t border-base-700/60">
        <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
          <Radio className="w-3 h-3" />
          <span className="truncate">{isDemo ? 'Demo data — connect a cluster' : info?.server || 'Connected'}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex bg-base-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-base-700/60 bg-base-900/60 flex-col">{sidebar}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-base-900 border-r border-base-700">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 h-14 border-b border-base-700/60 bg-base-900/40 shrink-0">
          <button className="lg:hidden text-slate-400" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {isDemo && (
            <button
              onClick={() => setShowAdd(true)}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-full px-3 py-1.5 hover:bg-amber-500/20 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Viewing demo cluster — connect yours
            </button>
          )}
          <div className="flex-1" />
          <button onClick={refresh} title="Refresh all (Ctrl+Shift+R)" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-base-800 hover:bg-base-700 border border-base-600 rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>

      {showAdd && <AddClusterModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
