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
 * The grade's colour class, spelled out one per line rather than built as
 * `q-${quality}`.
 *
 * These rules live in index.css inside `@layer components`, which Tailwind
 * tree-shakes against the class names it can find in the source. A name only
 * ever assembled at runtime is a name it cannot find, so every grade chip
 * shipped unstyled - grey text where the whole design expects the crew to read
 * the grade off its colour before its name. Written out, the scanner sees them.
 */
const GRADE_CLASS: Record<DispatchGrade, string> = {
  Special: 'q-Special',
  SuperFine: 'q-SuperFine',
  Fine: 'q-Fine',
  Medium: 'q-Medium',
  DRC: 'q-DRC',
  // The grade reads `Special DRC`; the class cannot carry that space, so this
  // is also the one entry whose class is not the grade with `q-` in front.
  'Special DRC': 'q-SpecialDRC',
  Coarse: 'q-Coarse',
  Sillsheet: 'q-Sillsheet',
};

/**
 * The grade's chip class, for the screens that colour something other than a
 * chip with it - the grade filter buttons on Pack and Stock.
 *
 * Those built their own `q-${grade}`, which held for as long as no grade had a
 * space in its name: `q-Special DRC` is two classes, and the second of them is
 * not a class at all, so the button came out in Special's cyan. They ask here
 * now. A name with no colour of its own - a product - returns undefined and
 * falls through to the default fill, which is what those screens already did.
 */
export const gradeClass = (grade: string): string | undefined =>
  GRADE_CLASS[grade as DispatchGrade];

/**
 * The custom property carrying a grade's colour, for the dots that are a
 * background rather than a class: `Special DRC` -> `var(--q-special-drc)`.
 *
 * Same trap as gradeClass, one layer down - the token names in index.css are
 * lowercase and hyphenated, so a grade with a space in it needs the space
 * turned into the hyphen rather than dropped into the property name as-is.
 */
export const gradeVar = (grade: string): string =>
  `var(--q-${grade.toLowerCase().replace(/\s+/g, '-')})`;

/**
 * Colour-coded grade chip. The six refiner qualities plus Coarse and
 * Sillsheet, which only ever appear on a dispatch line.
 */
export function QualityChip({
  quality,
  className,
}: {
  quality: DispatchGrade | string;
  className?: string;
}) {
  return (
    <span className={cn('qchip', GRADE_CLASS[quality as DispatchGrade], className)}>{quality}</span>
  );
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
