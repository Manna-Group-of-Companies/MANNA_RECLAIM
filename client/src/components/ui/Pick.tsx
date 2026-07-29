import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Grid of large tap targets - the prototype picks quality, capacity, customer with it. */
export function PickGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('pickgrid', className)}>{children}</div>;
}

export interface PickProps {
  selected?: boolean;
  onClick: () => void;
  title: ReactNode;
  sub?: ReactNode;
  /** `cap` renders the title in mono at 20px, for autoclave capacities. */
  tone?: 'default' | 'q' | 'cap';
  /**
   * A colour swatch before the title, the same one the grade wears on its chip
   * and in the batch grid - the crews pick a grade by its colour before they
   * read its name.
   */
  dot?: string;
  className?: string;
}

export function Pick({
  selected = false,
  onClick,
  title,
  sub,
  tone = 'default',
  dot,
  className,
}: PickProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('pick', tone !== 'default' && tone, selected && 'sel', className)}
    >
      <b>
        {dot && <span className="qdot" style={{ background: dot }} />}
        {title}
      </b>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** Read-only key / value strip used to show a computed total inside a sheet. */
export function Readout({
  label,
  value,
  valueColor,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={cn('ro', className)}>
      <span className="k">{label}</span>
      <span className="v" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** Uppercase divider inside a sheet. */
export function SheetLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sheet-label', className)}>{children}</div>;
}

/** `.view-head`: the tab title on the left, a live count on the right. */
export function ViewHead({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="view-head">
      <h1>{title}</h1>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

export default Pick;
