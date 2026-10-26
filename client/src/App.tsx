import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClusterProvider } from './context/ClusterContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Nodes } from './pages/Nodes';
import { Pods } from './pages/Pods';
import { Workloads } from './pages/Workloads';
import { Network } from './pages/Network';
import { Config } from './pages/Config';
import { Storage } from './pages/Storage';
import { Events } from './pages/Events';
import { Namespaces } from './pages/Namespaces';
import { Rbac } from './pages/Rbac';
import { PortForwards } from './pages/PortForwards';
import { Settings } from './pages/Settings';

// NOTE: deliberately a single bundle (no route code-splitting). This is a
// localhost-first tool, so ~1 MB of JS loads instantly — and one file means
// chunk-load failures are impossible. Only the huge Monaco editor (~4 MB,
// used solely for YAML) loads on demand, with retries.

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

export default function App() {
  // Signals the boot watchdog in index.html that the app actually mounted.
  useEffect(() => {
    (window as any).__ks_mounted = true;
  }, []);

  return (
    <QueryClientProvider client={qc}>
      <ClusterProvider>
        <BrowserRouter>
          <Layout>
            <ErrorBoundary title="This page crashed">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/nodes" element={<Nodes />} />
                <Route path="/namespaces" element={<Namespaces />} />
                <Route path="/events" element={<Events />} />
                <Route path="/pods" element={<Pods />} />
                <Route path="/workloads" element={<Workloads />} />
                <Route path="/network" element={<Network />} />
                <Route path="/port-forwards" element={<PortForwards />} />
                <Route path="/config" element={<Config />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/rbac" element={<Rbac />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </Layout>
        </BrowserRouter>
      </ClusterProvider>
    </QueryClientProvider>
  );
}
