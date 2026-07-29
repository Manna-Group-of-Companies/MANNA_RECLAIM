import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { DispatchGrade } from '@/types/models';

type Tone = 'neutral' | 'run' | 'paused' | 'down' | 'shift' | 'ok' | 'warn';

/**
 * The state pill on a machine card and anywhere else a run has a status.
 * `.pill` and its modifiers come straight from the prototype stylesheet.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('pill', tone !== 'neutral' && tone, className)}>{children}</span>;
}

/**
 * Colour-coded grade chip. The five refiner qualities plus Coarse and
 * Sillsheet, which only ever appear on a dispatch line.
 */
export function QualityChip({
  quality,
  className,
}: {
  quality: DispatchGrade | string;
  className?: string;
}) {
  return <span className={cn('qchip', `q-${quality}`, className)}>{quality}</span>;
}

/** Monospaced batch number, the anchor of every card in the prototype. */
export function BatchRef({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('batchref', className)}>{children}</span>;
}

/** Outlined secondary chip: formulation, mesh, shift date, machine short code. */
export function FormChip({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn('formchip', className)} style={style}>
      {children}
    </span>
  );
}

export default Badge;
