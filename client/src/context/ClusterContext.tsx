import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { k8s, ClusterInfo } from '../lib/api';

interface ClusterCtx {
  clusters: ClusterInfo[];
  current: string;
  isDemo: boolean;
  namespace: string;
  setNamespace: (ns: string) => void;
  switchCluster: (name: string) => Promise<void>;
  refresh: () => void;
  loading: boolean;
}

const Ctx = createContext<ClusterCtx | null>(null);

export function ClusterProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [namespace, setNamespace] = useState('all');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clusters'],
    queryFn: k8s.clusters,
    refetchInterval: 15000,
  });

  const current = data?.current || 'demo';
  const clusters = data?.clusters || [];
  const isDemo = clusters.find((c) => c.name === current)?.isDemo ?? true;

  const switchCluster = useCallback(async (name: string) => {
    await k8s.switchCluster(name);
    await qc.invalidateQueries();
    await refetch();
  }, [qc, refetch]);

  const refresh = useCallback(() => {
    qc.invalidateQueries();
    refetch();
  }, [qc, refetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ clusters, current, isDemo, namespace, setNamespace, switchCluster, refresh, loading: isLoading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCluster() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCluster must be used within ClusterProvider');
  return v;
}
