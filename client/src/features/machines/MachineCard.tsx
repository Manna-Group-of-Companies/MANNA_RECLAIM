import { BatchRef, FormChip, Icon, QualityChip } from '@/components/ui';
import { elapsed, kg } from '@/utils/format';
import { clock, dayMonth } from '@/utils/date';
import { useTicker } from '@/hooks/useTicker';
import { KIND_ACCENT } from '@/config/constants';
import { cn } from '@/utils/cn';
import type { BearingDue, MaintenanceLog, Machine, Run } from '@/types/models';

export interface MachineCardProps {
  machine: Machine;
  run?: Run;
  /** The open breakdown, if this machine is currently flagged DOWN. */
  down?: MaintenanceLog;
  /** The last run on this machine, shown on the idle line. */
  last?: Run;
  bearing?: BearingDue;
  onStart: (machine: Machine) => void;
  onStop: (run: Run) => void;
  onPause: (run: Run, paused: boolean) => void;
  onBreakdown: (machine: Machine) => void;
  onRepair: (log: MaintenanceLog) => void;
  onBearing: (machine: Machine) => void;
}

/**
 * One machine, in the three states it can be in: running (timer + pause),
 * down (red rail + repair prompt), or idle (what it last did + a start CTA).
 * Tapping the card body is the primary action for each state, so the crew can
 * work it with gloves on; the small square buttons are the secondary ones.
 */
export function MachineCard({
  machine,
  run,
  down,
  last,
  bearing,
  onStart,
  onStop,
  onPause,
  onBreakdown,
  onRepair,
  onBearing,
}: MachineCardProps) {
  const running = Boolean(run);
  const paused = Boolean(run?.paused);
  const isDown = Boolean(down);
  const accent = machine.accent ?? KIND_ACCENT[machine.kind] ?? 'var(--line2)';

  // Only tick while something is actually counting up.
  useTicker(1000, (running && !paused) || isDown);

  const pill = isDown ? 'DOWN' : running ? (paused ? 'Paused' : 'Running') : 'Idle';
  const pillTone = isDown ? 'down' : running ? (paused ? 'paused' : 'run') : '';

  const sub = machine.sub ?? (machine.kind === 'autoclave' && machine.capacity ? `${machine.capacity} kg` : '');

  const lastLine = last
    ? `last ${last.batch_no ?? last.shift ?? ''}${last.quality ? ` · ${last.quality}` : ''}${
        last.ended_at ? ` · ${clock(last.ended_at)}` : ''
      }`
    : 'no runs yet';

  const openBody = () => {
    if (isDown && down) return onRepair(down);
    if (run) return onStop(run);
    return onStart(machine);
  };

  return (
    <div
      className={cn('mcard', running && 'on', paused && 'paused', isDown && 'down')}
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div className="mtop">
        <span className="led" />
        <button type="button" onClick={openBody} className="mname min-w-0 flex-1 bg-transparent p-0 text-left">
          <b>{machine.name}</b>
          {sub && <small>{sub}</small>}
        </button>

        {bearing && (
          <button
            type="button"
            className={cn('tbtn', bearing.due && 'due')}
            onClick={() => onBearing(machine)}
            aria-label={`${bearing.bearingType} temperatures`}
          >
            <Icon name="thermo" size={16} strokeWidth={2} />
          </button>
        )}
        {!isDown && (
          <button
            type="button"
            className="wbtn"
            onClick={() => onBreakdown(machine)}
            aria-label="Report breakdown"
          >
            <Icon name="wrench" size={16} strokeWidth={2} />
          </button>
        )}
        <span className={cn('pill', pillTone)}>{pill}</span>
      </div>

      {isDown && down ? (
        <div className="mbody">
          <div className="runline">
            <div className="what">
              <span className="qchip hold">Breakdown</span>
              <FormChip>since {clock(down.down_start)}</FormChip>
            </div>
            <span className="timer" style={{ color: 'var(--err)' }}>
              {down.down_start ? elapsed(down.down_start) : '--'}
            </span>
          </div>
          <button type="button" className="pausebtn repair" onClick={() => onRepair(down)}>
            Log repair
          </button>
        </div>
      ) : run ? (
        <div className="mbody">
          <div className="runline">
            <div className="what">
              {run.batch_no && <BatchRef>{run.batch_no}</BatchRef>}
              {run.formulation && <FormChip>{run.formulation}</FormChip>}
              {run.shift_date && !run.batch_no && <FormChip>{dayMonth(run.shift_date)}</FormChip>}
              {run.quality && <QualityChip quality={run.quality} />}
              {run.mesh && <FormChip style={{ color: 'var(--steel)' }}>{run.mesh}</FormChip>}
              {run.out_weight != null && <FormChip>{kg(run.out_weight)}</FormChip>}
            </div>
            <span className={cn('timer', paused && 'paused')}>{elapsed(run.started_at)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn('pausebtn', paused && 'paused')}
              onClick={() => onPause(run, !paused)}
            >
              {paused ? '▶ Resume run' : '❚❚ Pause run'}
            </button>
            <button
              type="button"
              className="pausebtn repair !w-auto px-4"
              onClick={() => onStop(run)}
            >
              {machine.kind === 'autoclave' ? 'Unload' : 'Stop'} ▸
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => onStart(machine)} className="mbody w-full bg-transparent p-0">
          <div className="idleline">
            <span>{lastLine}</span>
            <span className="cta" style={{ '--accent': accent } as React.CSSProperties}>
              {machine.kind === 'autoclave' ? 'Load' : 'Start'} ▸
            </span>
          </div>
        </button>
      )}
    </div>
  );
}

export default MachineCard;
