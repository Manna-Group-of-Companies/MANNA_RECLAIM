import { clock24 } from '@/utils/date';
import { num } from '@/utils/format';
import type { AutoclaveCharge } from '@/types/models';

/**
 * Every charge a vessel took this shift, and how long each one took.
 *
 * A vessel used to be judged on how many charges it got through in a day, and
 * that is a fact about how much work there was rather than about the vessel - a
 * quiet day is not a slow autoclave, and the crew cannot answer for it. How long
 * each charge took is the vessel's own: it is what moves when a valve is passing
 * or the fire is not being kept up.
 *
 * The card carries the shift's average as its measured figure, because a reason
 * is filed against one parameter and two charges in a shift would collide on a
 * per-charge one. This is the working under it, and it is not decoration: the
 * rule the plant set is that every charge matches the time, and an average of a
 * quick one and one that doubled reads as a respectable shift.
 *
 * `.detrow` and `.effhit`/`.effmiss` are declared for the whole app rather than
 * under `.back-office`, so this one component draws on both the office screen
 * and the tablet.
 */
export function ChargeList({ charges }: { charges?: AutoclaveCharge[] }) {
  if (!charges?.length) return null;

  return (
    <div className="mt-2">
      {charges.map((c) => (
        <div key={c.id} className="detrow">
          <span className="k">
            {c.batch ?? 'charge'}
            {c.startedAt && <span className="muted"> · from {clock24(c.startedAt)}</span>}
          </span>
          <span className="v">
            {c.hours == null ? (
              // A charge whose time nobody wrote down. Said as that rather than
              // as nought hours, which would read as a charge that flew through.
              <span className="effnote">no time recorded</span>
            ) : (
              <>
                <b>{num(c.hours, 2)} h</b>{' '}
                {c.overBy == null ? (
                  <span className="effnote">no target</span>
                ) : (
                  <span className={c.offTarget ? 'effmiss' : 'effhit'}>
                    {c.overBy > 0 ? '+' : ''}
                    {num(c.overBy, 2)} h
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ChargeList;
