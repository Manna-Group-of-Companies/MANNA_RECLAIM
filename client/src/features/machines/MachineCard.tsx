import { Card, Badge, QualityChip, Button } from '@/components/ui';
import { elapsed, kg } from '@/utils/format';
import { useTicker } from '@/hooks/useTicker';
import { cn } from '@/utils/cn';
import type { Machine, Run } from '@/types/models';

export interface MachineCardProps {
  machine: Machine;
  run?: Run;
  onStart: (machine: Machine) => void;
  onStop: (run: Run) => void;
}

/** One machine row: LED, name, state pill and either the timer or a start CTA. */
export function MachineCard({ machine, run, onStart, onStop }: MachineCardProps) {
  const running = Boolean(run);
  useTicker(1000, running && !run?.paused);

  return (
    <Card accent={machine.accent ?? undefined} active={running}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'h-3 w-3 flex-none rounded-full',
            running ? 'bg-brand shadow-[0_0_10px_1px_theme(colors.brand.DEFAULT)] animate-pulse-led' : 'bg-line-strong',
          )}
        />
        <div className="min-w-0 flex-1">
          <b className="block text-[17px] font-bold">{machine.name}</b>
          <small className="text-[11.5px] text-ink-faint">{machine.sub ?? machine.group_name}</small>
        </div>
        {run?.paused ? <Badge tone="paused">Paused</Badge> : <Badge tone={running ? 'run' : 'neutral'}>{running ? 'Running' : 'Idle'}</Badge>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {run ? (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {run.quality && <QualityChip quality={run.quality} />}
              {run.out_weight != null && <span className="tnum text-xs text-ink-dim">{kg(run.out_weight)}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('tnum text-2xl font-semibold', run.paused ? 'text-state-pause' : 'text-brand')}>
                {elapsed(run.started_at)}
              </span>
              <Button size="sm" variant="danger" onClick={() => onStop(run)}>
                Stop
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[13px] text-ink-faint">Not running</span>
            <Button size="sm" variant="primary" onClick={() => onStart(machine)}>
              Start
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export default MachineCard;
