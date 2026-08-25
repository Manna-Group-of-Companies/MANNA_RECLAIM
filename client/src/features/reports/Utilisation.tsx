import { cn } from '@/utils/cn';
import { num } from '@/utils/format';
import type { MachineUtilisation, UtilisationTotals } from '@/types/models';

/**
 * How much of the twelve hours each machine ran.
 *
 * It was on the grinder cards and nowhere else, so the plant could see that
 * Grinder 1 ran nine hours of twelve and had no way at all to ask the same of a
 * refiner, a vessel or a press. It is the one question on this screen that means
 * the same thing for every machine the plant owns - a shift is twelve hours
 * whatever is bolted to the floor - so it is answered for all of them, in one
 * list, rather than being a line on the four cards that had room for it.
 *
 * Every machine, including the ones that did not run. Nought of twelve is the
 * answer to the question and it is the answer worth having: a report that
 * quietly left out the machines nobody switched on would show the plant as
 * busier the less of it was working.
 *
 * Two layouts, because the back office and the tablet cannot share one - nearly
 * every class the back office draws with is declared under `.back-office`, so
 * the same markup on a tablet renders as bare text. The reading of the figures
 * is here once and both call it.
 */

/** What a machine's hours mean, in the fewest words that are still true. */
const utilisationNote = (u: MachineUtilisation) => {
  if (u.down) return u.down.open ? 'broken down' : 'was down this shift';
  if (u.runs === 0) return 'not run';
  if (u.pct > 100) return 'ran past the shift change';
  return `${num(u.idle, 1)} h idle`;
};

/**
 * The bar's tone.
 *
 * Amber rather than red for a machine that simply did not run: it is a gap to
 * ask about, not a failure, and the plant has shifts where a line is genuinely
 * not needed. Red is reserved for a machine that ran and ran short.
 */
const utilisationTone = (u: MachineUtilisation) => {
  if (u.down) return 'down';
  if (u.runs === 0) return 'idle';
  return u.warn ? 'low' : 'ok';
};

/** The bar itself. Width is the figure; over 100% it fills and says so. */
function Bar({ u }: { u: MachineUtilisation }) {
  return (
    <div className="utilbar">
      <span
        className={cn('fill', utilisationTone(u))}
        style={{ width: `${Math.min(100, u.pct)}%` }}
      />
    </div>
  );
}

/** The back office's: a row per machine, grouped as the machine list is. */
export function UtilisationTable({
  rows,
  totals,
}: {
  rows: MachineUtilisation[];
  totals?: UtilisationTotals;
}) {
  if (!rows.length) return null;

  return (
    <>
      <div className="grouphead">Machine utilisation · hours run of the 12-hour shift</div>

      {totals && (
        <div className="panel">
          <div className="kpis">
            <div className="kpi">
              <b>{totals.pct}%</b>
              <span>the plant, on average</span>
            </div>
            <div className="kpi">
              <b>
                {totals.ran}/{totals.machines}
              </b>
              <span>machines ran</span>
            </div>
            <div className="kpi">
              <b>{num(totals.hours, 1)}</b>
              <span>machine-hours</span>
            </div>
          </div>
          {/*
            The mean of the machines, not the hours over capacity. They differ,
            and this is the one that answers "how much of the plant was
            working": summing hours lets one vessel on a long charge cover for
            three machines standing idle.
          */}
          <div className="sub mt-2">
            The average is across the {totals.machines} machines on the plant, each against the
            same {totals.shiftHours} hours — so a machine nobody switched on counts as the nought
            it was.
          </div>
        </div>
      )}

      <div className="panel scroll-x mt-0 p-0">
        <table className="tt min-w-[460px]">
          <thead>
            <tr>
              <th>Machine</th>
              <th className="tnum">Ran</th>
              <th>Of 12 h</th>
              <th className="tnum">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.machineId}>
                <td>
                  <b>{u.machine}</b>
                  <div className="muted text-[10px]">
                    {u.group ?? u.kind}
                    {u.operator ? ` · ${u.operator}` : ''}
                  </div>
                </td>
                <td className="tnum">
                  {num(u.hours, 1)} h
                  {u.runs > 1 && <div className="muted text-[9px]">{u.runs} records</div>}
                </td>
                <td>
                  <Bar u={u} />
                  <div className="muted text-[10px]">{utilisationNote(u)}</div>
                </td>
                <td className="tnum">
                  <b className={cn(u.warn && 'text-[var(--err)]')}>{u.pct}%</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The tablet's: the same figures as cards, read at arm's length. */
export function UtilisationCards({
  rows,
  totals,
}: {
  rows: MachineUtilisation[];
  totals?: UtilisationTotals;
}) {
  if (!rows.length) return null;

  return (
    <>
      <div className="msec">
        <b>Machine utilisation</b>
        <div className="ln" />
        {totals && (
          <span className="ct">
            {totals.ran} of {totals.machines} ran
          </span>
        )}
      </div>

      {totals && (
        <div className={cn('effsum', totals.pct < 70 && 'flag')}>
          <b>{totals.pct}%</b> of the plant used this shift
          <div className="effnote">
            {num(totals.hours, 1)} machine-hours across {totals.machines} machines, each against
            the same {totals.shiftHours} hours
          </div>
        </div>
      )}

      <div className="panel">
        {rows.map((u) => (
          <div key={u.machineId} className={cn('effline', u.warn && 'miss')}>
            <div className="effname">
              <div>
                {u.short ?? u.machine}
                <div className="muted text-[11px]">{utilisationNote(u)}</div>
              </div>
            </div>
            <div className="effnums">
              <b>{u.pct}%</b>
              <span className="efftarget">
                {num(u.hours, 1)} h of {totals?.shiftHours ?? 12}
              </span>
              <Bar u={u} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default UtilisationTable;
