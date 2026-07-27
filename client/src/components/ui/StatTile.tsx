import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  className?: string;
}

/** The 2-up KPI tile from the Reports tab and the admin dashboard. */
export function StatTile({ label, value, unit, hint, className }: StatTileProps) {
  return (
    <div className={cn('panel px-4 py-3.5', className)}>
      <p className="tnum text-2xl font-semibold leading-none text-ink">
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal text-ink-dim">{unit}</span>}
      </p>
      <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

export default StatTile;
