import { BatchRef, FormChip, Icon, QualityChip } from '@/components/ui';
import { elapsed, kg, runElapsed } from '@/utils/format';
import { clock, clockSec, dayMonth } from '@/utils/date';
import { useTicker } from '@/hooks/useTicker';
import { KIND_ACCENT, isMoulding } from '@/config/constants';
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
  /** Opens the running tally on a shiftwise machine whose output is weighed. */
  onTally: (run: Run) => void;
}

/**
 * Whether this run keeps a running tally: a machine run for a shift, whose
 * output is weighed afterwards, so each load is banked as it comes off rather
 * than remembered until the shift ends. That is the coarse refiner and the
 * grinders - never a batch pass, which is weighed once against its batch.
 */
const tallies = (machine: Machine, run?: Run) =>
  Boolean(machine.out_weight) && (run?.line === 'coarse' || run?.line === 'grind');

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  onTally,
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

  const showTally = !isDown && tallies(machine, run);
  const tally = run?.weigh_entries ?? [];
  const tallied = tally.length ? round2(tally.reduce((total, n) => total + n, 0)) : 0;

  /**
   * What this machine last did, on the idle line - and nothing at all on a
   * sleeve or loop bench.
   *
   * The line leads on the batch number, which is the right thing to lead on
   * everywhere it is a batch: `last B1041 · Fine · 10:03 am` is a crew reading
   * which lot came off here. A sleeve or loop number is the shift it was worked,
   * so the same line renders `last 04/Aug/26-day · 10:03 am` - a date where a
   * batch belongs, followed by a time, saying when twice and what never. The
   * bench is one product per shift and the crew standing at it knows what it ran;
   * the honest version of this line is the empty one.
   */
  const lastLine = isMoulding(machine.kind)
    ? null
    : last
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

        {showTally && run && (
          <button
            type="button"
            className="tbtn"
            style={{ color: 'var(--steel)' }}
            onClick={() => onTally(run)}
            aria-label={`Add weight — ${machine.name}`}
          >
            <Icon name="scale" size={16} strokeWidth={2} />
          </button>
        )}
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
              {/*
                And the batches going through with it.

                Picked at the machine and then nowhere to be seen: the card led
                with the batch the run is filed under, which is one of two
                numbers on a mixed pass. A crew walking the line reads these
                cards to know what each machine is on, and a pass carrying the
                tailings of another batch was reading as a pass on one.

                Kept apart from the batch itself rather than joined into one
                string, and in the colour the plant already reads as "and this
                went in too", so the number the record keys on is still the one
                that leads.
              */}
              {(run.sources?.length ?? 0) > 1 && (
                <FormChip style={{ color: 'var(--ember)' }}>
                  + {run.sources!.slice(1).join(' + ')}
                </FormChip>
              )}
              {run.formulation && <FormChip>{run.formulation}</FormChip>}
              {/* A press says what it is moulding, and what it is moulding it at.
                  A sleeve or loop lot already leads with its batch number above,
                  which names the product - so repeating it would be the same
                  word twice on a card the crew reads at a glance. */}
              {run.product && !isMoulding(run.kind) && <FormChip>{run.product}</FormChip>}
              {run.cure_temp_c != null && <FormChip>{run.cure_temp_c} °C</FormChip>}
              {run.shift_date && !run.batch_no && <FormChip>{dayMonth(run.shift_date)}</FormChip>}
              {run.quality && <QualityChip quality={run.quality} />}
              {run.mesh && <FormChip style={{ color: 'var(--steel)' }}>{run.mesh}</FormChip>}
              {run.out_weight != null && <FormChip>{kg(run.out_weight)}</FormChip>}
              {tally.length > 0 && (
                <FormChip style={{ color: 'var(--steel)' }}>
                  {kg(tallied)} · {tally.length} load{tally.length > 1 ? 's' : ''}
                </FormChip>
              )}
            </div>
            {/* How long it has been running leads, in the big figure the crew
                reads across the floor - and the time it was started at sits
                under it, hours:minutes:seconds, because that is the reading
                that goes on the shift's sheet and it cannot be got off a
                counter without subtracting it from the wall clock first. The
                lower line is named: `10:03:47` and `2:14:07` are the same
                shape, and an unlabelled pair of them is two numbers nobody can
                tell apart. The upper figure stands still while the run is
                paused - see runElapsed(). */}
            <div className="flex flex-col items-end leading-tight">
              <span className={cn('timer', paused && 'paused')}>{runElapsed(run)}</span>
              <small className="whitespace-nowrap text-[11px] text-ink-faint">
                started {clockSec(run.started_at)}
              </small>
            </div>
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
          {/* The span is rendered empty rather than dropped when there is no
              line to show, so the CTA stays where it sits on every other card -
              `.idleline` spaces its two children apart, and one child would
              pull Start across to the left on the sleeve and loop benches
              alone. */}
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
