import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { formatDate, timeAgo } from '../lib/utils';
import { Loading, ErrorBox, Kv } from './ui';

export function DescribeView({ kind, namespace, name }: { kind: string; namespace: string; name: string }) {
  const { current } = useCluster();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['resource', current, kind, namespace, name],
    queryFn: () => k8s.get(current, kind, namespace, name),
  });

  if (isLoading) return <Loading label="Loading details…" />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const item = data?.item;
  if (!item) return <p className="text-sm text-slate-500 p-5">Resource not found.</p>;

  const md = item.metadata || {};
  const labels = md.labels || {};
  const anns = md.annotations || {};
  const spec = item.spec || {};
  const status = item.status || {};

  const mapRows = (obj: Record<string, string>) =>
    Object.keys(obj).length === 0 ? (
      <span className="text-slate-600">—</span>
    ) : (
      <span className="font-mono text-[12px] break-all">
        {Object.entries(obj).map(([k, v]) => (
          <span key={k} className="inline-block bg-base-800 rounded px-1.5 py-0.5 mr-1 mb-1 border border-base-700/60">
            {k}={v}
          </span>
        ))}
      </span>
    );

  return (
    <div className="p-5 space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Metadata</h3>
        <Kv k="Name" v={md.name} mono />
        <Kv k="Namespace" v={md.namespace || '—'} mono />
        <Kv k="UID" v={md.uid || '—'} mono />
        <Kv k="Created" v={`${formatDate(md.creationTimestamp)} (${timeAgo(md.creationTimestamp)} ago)`} />
        <Kv k="Labels" v={mapRows(labels)} />
        <Kv k="Annotations" v={mapRows(anns)} />
        {md.ownerReferences?.length > 0 && (
          <Kv k="Owned by" v={md.ownerReferences.map((o: any) => `${o.kind}/${o.name}`).join(', ')} mono />
        )}
      </section>

      {kind === 'pods' && <PodDetail item={item} />}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Spec</h3>
        <pre className="text-[12px] font-mono text-slate-300 bg-base-800/50 border border-base-700/60 rounded-lg p-3 overflow-auto max-h-72">
          {JSON.stringify(spec, null, 2)}
        </pre>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Status</h3>
        <pre className="text-[12px] font-mono text-slate-300 bg-base-800/50 border border-base-700/60 rounded-lg p-3 overflow-auto max-h-72">
          {JSON.stringify(status, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function PodDetail({ item }: { item: any }) {
  const spec = item.spec || {};
  const status = item.status || {};
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Pod</h3>
      <Kv k="Phase" v={status.phase || 'Unknown'} mono />
      <Kv k="Node" v={spec.nodeName || '—'} mono />
      <Kv k="Pod IP" v={status.podIP || status.podIPs?.[0]?.ip || '—'} mono />
      <Kv k="Host IP" v={status.hostIP || '—'} mono />
      <Kv k="QoS" v={status.qosClass || '—'} mono />
      <Kv k="Service account" v={spec.serviceAccountName || spec.serviceAccount || 'default'} mono />
      {(spec.containers || []).map((c: any) => (
        <div key={c.name} className="mt-3 rounded-lg border border-base-700/60 bg-base-800/40 p-3">
          <p className="font-mono text-[13px] text-slate-200 font-semibold">{c.name}</p>
          <p className="font-mono text-[12px] text-slate-400 break-all mt-0.5">{c.image}</p>
          {(c.ports || []).length > 0 && (
            <p className="font-mono text-[12px] text-slate-500 mt-1">
              ports: {c.ports.map((p: any) => `${p.containerPort}${p.protocol ? `/${p.protocol}` : ''}`).join(', ')}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
