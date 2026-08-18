import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchIdealValues, saveIdealValues } from '@/features/rates/ratesSlice';
import { IDEAL_VALUE_GROUPS } from '@/config/constants';
import { adminPaths } from '@/config/paths';
import { useToast } from '@/hooks/useToast';
import { dayLong } from '@/utils/date';
import { NavLink } from 'react-router-dom';

/** A form's worth of typed figures, ready to be sent. */
const toNumbers = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]),
  );

/**
 * What the plant *should* be making, as the manager sets it.
 *
 * Its own tab rather than a sheet at the foot of Rates, where it started. The
 * two are not the same statement - what a thing costs is read by Costing, what
 * a shift ought to make is read by Efficiency - and a page you reach by
 * scrolling past somebody else's figures is a page that gets filled in once and
 * never revisited. These are meant to be revisited: a target is a decision, and
 * a decision that no longer matches the plant is worse than no target at all.
 */
export function IdealValuesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { idealValues, savingIdeals } = useAppSelector((s) => s.rates);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [ideals, setIdeals] = useState<Record<string, string>>({});

  useEffect(() => {
    void dispatch(fetchIdealValues());
  }, [dispatch, refreshTick]);

  // Seed the form once the stored figures arrive, then leave it alone so a
  // refresh mid-edit cannot silently overwrite what is being typed.
  useEffect(() => {
    if (!idealValues) return;
    setIdeals((current) =>
      Object.keys(current).length
        ? current
        : Object.fromEntries(
            Object.entries(idealValues.data).map(([k, v]) => [k, v == null ? '' : String(v)]),
          ),
    );
  }, [idealValues]);

  /*
   * How much of the plant is actually benchmarked. A blank compares against
   * nothing and says so quietly on the Efficiency tab, one card at a time -
   * which is exactly how a sheet ends up half filled for a year without anyone
   * noticing. Counted here because this is the only screen that sees all of
   * them at once.
   */
  const coverage = useMemo(() => {
    const keys = IDEAL_VALUE_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    const set = keys.filter((k) => (ideals[k] ?? '').trim() !== '').length;
    return { set, total: keys.length };
  }, [ideals]);

  const save = async () => {
    const data = toNumbers(ideals);
    if (Object.values(data).some((v) => v != null && Number.isNaN(v))) {
      notify('Every ideal value has to be a number', 'warn');
      return;
    }
    if (Object.values(data).some((v) => v != null && v < 0)) {
      notify('An ideal value cannot be negative', 'warn');
      return;
    }
    const result = await dispatch(saveIdealValues(data));
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Ideal values saved' : 'Could not save the ideal values', okay ? 'ok' : 'err');
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Ideal values</h1>
        <div className="sub">
          What the plant should be making. The{' '}
          <NavLink to={adminPaths.efficiency} className="underline">
            Efficiency
          </NavLink>{' '}
          tab shows every figure it collects beside its ideal here, flags the ones that fall short,
          and asks for a reason.
          {idealValues?.updatedAt
            ? ` Last saved ${dayLong(idealValues.updatedAt.slice(0, 10))}${idealValues.updatedBy ? ` by ${idealValues.updatedBy}` : ''}.`
            : ''}
        </div>
        <div className="sub mt-1">
          Leave a figure blank and nothing is compared against it — a blank is “no target set”, not
          a target of zero.
        </div>
        <div className="sub mt-1">
          {coverage.set} of {coverage.total} targets set
          {coverage.set < coverage.total
            ? ` — the other ${coverage.total - coverage.set} are collected but measured against nothing.`
            : ' — everything the app collects has something to be held against.'}
        </div>
      </div>

      {IDEAL_VALUE_GROUPS.map((group) => (
        <div key={group.title} className="panel">
          <div className="grouphead mt-0">
            {group.title}
            {group.note && <span className="muted font-normal"> ({group.note})</span>}
          </div>
          {group.fields.map((field) => (
            <div key={field.key} className="field">
              <label htmlFor={`id-${field.key}`}>
                {field.label}
                {field.unit && <span className="muted font-normal"> ({field.unit})</span>}
              </label>
              <input
                id={`id-${field.key}`}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="not set"
                value={ideals[field.key] ?? ''}
                onChange={(e) => setIdeals({ ...ideals, [field.key]: e.target.value })}
              />
              {field.hint && <div className="sub mt-1">{field.hint}</div>}
            </div>
          ))}
        </div>
      ))}

      <button type="button" className="btn block mt-1" onClick={save} disabled={savingIdeals}>
        {savingIdeals ? 'Saving…' : 'Save ideal values'}
      </button>
      <div className="sub mt-2 text-center">Saved figures load automatically for everyone.</div>
    </>
  );
}

export default IdealValuesPage;
