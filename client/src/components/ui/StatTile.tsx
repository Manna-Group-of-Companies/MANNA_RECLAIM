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
    <div className={cn('stat', className)}>
      <div className="v">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="k">{label}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export default StatTile;
