import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';

export function NamespaceFilter() {
  const { current, namespace, setNamespace } = useCluster();
  const { data } = useQuery({
    queryKey: ['list', current, 'namespaces', 'all'],
    queryFn: () => k8s.list(current, 'namespaces', 'all'),
    refetchInterval: 30000,
  });
  const nss = (data?.items || []).map((n: any) => n.metadata?.name).filter(Boolean);
  return (
    <select className="ks-select" value={namespace} onChange={(e) => setNamespace(e.target.value)}>
      <option value="all">All namespaces</option>
      {nss.map((n: string) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}
