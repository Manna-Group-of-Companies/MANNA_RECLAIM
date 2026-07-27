import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { QUALITY_CLASS } from '@/config/constants';
import type { Quality } from '@/types/models';

type Tone = 'neutral' | 'run' | 'paused' | 'down' | 'shift' | 'ok' | 'warn';

const tones: Record<Tone, string> = {
  neutral: 'border-line-strong bg-black/20 text-ink-dim',
  run: 'border-brand bg-brand text-bg',
  paused: 'border-state-pause/40 bg-state-pause/10 text-state-pause',
  down: 'border-state-err bg-state-err text-white',
  shift: 'border-steel/40 bg-steel/10 text-steel',
  ok: 'border-state-ok/40 bg-state-ok/10 text-state-ok',
  warn: 'border-state-warn/40 bg-state-warn/10 text-state-warn',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center whitespace-nowrap rounded-full border px-2.5 py-1',
        'text-[10.5px] font-bold uppercase tracking-[0.12em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Colour-coded quality chip (Special / SuperFine / Fine / Medium / DRC). */
export function QualityChip({ quality }: { quality: Quality }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        QUALITY_CLASS[quality],
      )}
    >
      {quality}
    </span>
  );
}

export default Badge;
