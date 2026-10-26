import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCluster } from '../context/ClusterContext';
import { k8s } from '../lib/api';
import { Loading, ErrorBox, EmptyState, SearchInput } from './ui';
import { NamespaceFilter } from './NamespaceFilter';

export interface Column {
  key: string;
  header: string;
  render: (item: any) => React.ReactNode;
  sortValue?: (item: any) => string | number;
}

export function ResourceTable({
  kind,
  columns,
  onRowClick,
  searchKeys = ['metadata.name', 'metadata.namespace'],
  refreshInterval = 10000,
  namespaces = true,
  actions,
  filterFn,
}: {
  kind: string;
  columns: Column[];
  onRowClick?: (item: any) => void;
  searchKeys?: string[];
  refreshInterval?: number | false;
  namespaces?: boolean;
  actions?: React.ReactNode;
  filterFn?: (item: any) => boolean;
}) {
  const { current, namespace } = useCluster();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  // Client-side pagination: rendering thousands of rows at once freezes /
  // crashes tabs on large clusters, so only one page hits the DOM.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const query = useQuery({
    queryKey: ['list', current, kind, namespaces ? namespace : 'all'],
    queryFn: () => k8s.list(current, kind, namespaces ? namespace : 'all'),
    refetchInterval: refreshInterval === false ? false : refreshInterval,
  });

  const items = useMemo(() => {
    let list = query.data?.items || [];
    if (filterFn) list = list.filter(filterFn);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((it) => searchKeys.some((k) => String(getPath(it, k) || '').toLowerCase().includes(q)));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        list = [...list].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
        });
      }
    }
    return list;
  }, [query.data, search, sortKey, sortDir, searchKeys, columns, filterFn]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir(1); }
    else setSortDir((d) => (d === 1 ? -1 : 1));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(0), [kind, current, namespace, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visible = items.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const from = items.length === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(items.length, safePage * pageSize + pageSize);

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${kind}…`} />
        {namespaces && <NamespaceFilter />}
        <div className="flex-1" />
        <span className="text-xs text-slate-500">{items.length} items</span>
        {actions}
      </div>
      <div className="ks-card overflow-auto">
        <table className="ks-table w-full min-w-[700px]">
          <thead>
            <tr className="bg-base-850/60">
              {columns.map((c) => (
                <th key={c.key} onClick={c.sortValue ? () => toggleSort(c.key) : undefined} className={c.sortValue ? 'cursor-pointer select-none hover:text-slate-200' : ''}>
                  {c.header}{sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((it, i) => (
              <tr key={it.metadata?.uid || `${it.metadata?.namespace}/${it.metadata?.name}` || i} onClick={onRowClick ? () => onRowClick(it) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(it)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState title={`No ${kind} found`} hint={namespace !== 'all' ? 'Try switching namespace to "all".' : undefined} />}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-base-850/60 border-t border-base-700/60 text-xs text-slate-400">
            <span>Showing {from}–{to} of {items.length}</span>
            <div className="flex-1" />
            <select
              className="ks-select !py-1 !px-2 !text-xs"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              title="Rows per page"
            >
              {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button className="ks-btn-ghost !py-1 !px-2.5 !text-xs" disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
            <button className="ks-btn-ghost !py-1 !px-2.5 !text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹ Prev</button>
            <span className="px-1 font-mono">Page {safePage + 1} / {totalPages}</span>
            <button className="ks-btn-ghost !py-1 !px-2.5 !text-xs" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next ›</button>
            <button className="ks-btn-ghost !py-1 !px-2.5 !text-xs" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
