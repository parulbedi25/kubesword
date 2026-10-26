import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState } from './ui';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

const PAGE_SIZES = [25, 50, 100, 250];

export function ResourceTable<T extends object>({
  columns,
  rows,
  keyOf,
  onRowClick,
  search = '',
  filterFn,
  emptyTitle,
  emptyHint,
  pageSize: initialPageSize = 50,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowClick?: (row: T) => void;
  search?: string;
  filterFn?: (row: T, q: string) => boolean;
  emptyTitle?: string;
  emptyHint?: string;
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q && filterFn) out = rows.filter((r) => filterFn(r, q));
    else if (q) {
      out = rows.filter((r) => {
        try {
          return JSON.stringify(r).toLowerCase().includes(q);
        } catch {
          return false;
        }
      });
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = [...out].sort((a, b) => {
          const va = sv(a);
          const vb = sv(b);
          if (va === vb) return 0;
          return (va < vb ? -1 : 1) * sortDir;
        });
      }
    }
    return out;
  }, [rows, search, filterFn, sortKey, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(1);
    } else {
      setSortDir((d) => (d === 1 ? -1 : 1));
    }
    setPage(0);
  };

  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <div className="ks-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-700/60 bg-base-800/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap select-none',
                    c.sortValue && 'cursor-pointer hover:text-slate-300',
                    c.className,
                  )}
                  onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortValue && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={keyOf(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-base-800/60 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-base-800/50',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-2.5 align-top', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-500">No rows match “{search}”.</div>
      )}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-base-700/60 bg-base-800/30">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            {filtered.length === 0
              ? '0 rows'
              : `${safePage * pageSize + 1}–${Math.min(filtered.length, safePage * pageSize + pageSize)} of ${filtered.length}`}
          </span>
          <select
            className="ks-input !w-auto !py-1 !px-2 !text-xs"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}/page
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="ks-btn-ghost !p-1.5 disabled:opacity-40"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500 px-1">
            Page {safePage + 1} of {pages}
          </span>
          <button
            className="ks-btn-ghost !p-1.5 disabled:opacity-40"
            disabled={safePage >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
