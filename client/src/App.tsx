import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClusterProvider } from './context/ClusterContext';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';

// Route-level code splitting: each page (and its heavy deps like recharts /
// xterm / monaco) loads on demand instead of bloating the initial bundle.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Nodes = lazy(() => import('./pages/Nodes').then((m) => ({ default: m.Nodes })));
const Pods = lazy(() => import('./pages/Pods').then((m) => ({ default: m.Pods })));
const Workloads = lazy(() => import('./pages/Workloads').then((m) => ({ default: m.Workloads })));
const Network = lazy(() => import('./pages/Network').then((m) => ({ default: m.Network })));
const Config = lazy(() => import('./pages/Config').then((m) => ({ default: m.Config })));
const Storage = lazy(() => import('./pages/Storage').then((m) => ({ default: m.Storage })));
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const Namespaces = lazy(() => import('./pages/Namespaces').then((m) => ({ default: m.Namespaces })));
const Rbac = lazy(() => import('./pages/Rbac').then((m) => ({ default: m.Rbac })));
const PortForwards = lazy(() => import('./pages/PortForwards').then((m) => ({ default: m.PortForwards })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

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
  return (
    <QueryClientProvider client={qc}>
      <ClusterProvider>
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<Loading label="Loading page…" />}>
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
            </Suspense>
          </Layout>
        </BrowserRouter>
      </ClusterProvider>
    </QueryClientProvider>
  );
}
