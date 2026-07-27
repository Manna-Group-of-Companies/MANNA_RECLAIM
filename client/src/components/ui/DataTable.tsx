import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: string;
  onRowClick?: (row: T) => void;
}

const alignOf = (align?: 'left' | 'right' | 'center') =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

/** Horizontally scrollable table for the admin history / ledger views. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty = 'Nothing recorded yet',
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-ink-faint">{empty}</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'border-b border-line px-2 pb-2 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-faint',
                  alignOf(c.align),
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-line/60 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-panel-raised',
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-2 py-2.5 align-middle', alignOf(c.align), c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
