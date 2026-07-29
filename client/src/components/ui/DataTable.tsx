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

/** `table.hist` from the prototype - the History tab and the admin ledgers. */
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
    <div className="scroll-x -mx-3.5 px-3.5">
      <table className="hist">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={alignOf(c.align)}>
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
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn(alignOf(c.align), c.className)}>
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
