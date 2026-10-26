import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';

export function NamespaceFilter() {
  const { current, namespace, setNamespace } = useCluster();
  const { data } = useQuery({
    queryKey: ['namespaces', current],
    queryFn: () => k8s.list(current, 'namespaces'),
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  const names = items.map((n: any) => n.metadata?.name).filter(Boolean).sort();

  return (
    <select className="ks-input !w-52" value={namespace} onChange={(e) => setNamespace(e.target.value)}>
      <option value="all">All namespaces</option>
      {names.map((n: string) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
