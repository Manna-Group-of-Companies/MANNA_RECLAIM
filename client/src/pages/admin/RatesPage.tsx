import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { NavLink } from 'react-router-dom';
import {
  fetchCostRates,
  fetchRateCard,
  saveCostRates,
  saveRate,
} from '@/features/rates/ratesSlice';
import { BoModal } from '@/components/ui';
import { COST_RATE_GROUPS, DISPATCH_GRADES } from '@/config/constants';
import { adminPaths } from '@/config/paths';
import { useToast } from '@/hooks/useToast';
import { dayLong } from '@/utils/date';
import type { DispatchGrade, Rate } from '@/types/models';

const blankRate = { customer: '', grade: 'Special' as DispatchGrade, rate: '', note: '' };

/** A form's worth of typed figures, ready to be sent. */
const toNumbers = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]),
  );

const anyNotANumber = (data: Record<string, number | null>) =>
  Object.values(data).some((v) => v != null && Number.isNaN(v));

/**
 * back.html's Rates tab: the plant's cost inputs, which the Costing view is
 * priced from, and the customer selling rates under them, since they are the
 * other half of "rates" and have nowhere else to be edited.
 *
 * The plant's ideal values sat between the two and now have a tab of their own:
 * what a thing costs and what a shift ought to make are two statements, read by
 * two different screens.
 */
export function RatesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { rates, costRates, saving } = useAppSelector((s) => s.rates);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<typeof blankRate | null>(null);

  useEffect(() => {
    void dispatch(fetchCostRates());
    void dispatch(fetchRateCard());
  }, [dispatch, refreshTick]);

  // Seed the form once the stored figures arrive, then leave it alone so a
  // refresh mid-edit cannot silently overwrite what is being typed.
  useEffect(() => {
    if (!costRates) return;
    setValues((current) =>
      Object.keys(current).length
        ? current
        : Object.fromEntries(
            Object.entries(costRates.data).map(([k, v]) => [k, v == null ? '' : String(v)]),
          ),
    );
  }, [costRates]);

  const save = async () => {
    const data = toNumbers(values);
    if (anyNotANumber(data)) {
      notify('Every rate has to be a number', 'warn');
      return;
    }
    const result = await dispatch(saveCostRates(data));
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Rates saved' : 'Could not save the rates', okay ? 'ok' : 'err');
  };

  const saveCustomerRate = async () => {
    if (!editing) return;
    const value = Number(editing.rate);
    if (!editing.customer.trim() || !editing.rate.trim() || Number.isNaN(value) || value <= 0) {
      notify('A customer and a rate above zero are needed', 'warn');
      return;
    }
    const result = await dispatch(
      saveRate({
        customer: editing.customer.trim().toUpperCase(),
        grade: editing.grade,
        rate: value,
        note: editing.note.trim() || null,
      } as Rate),
    );
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Rate saved' : 'Could not save the rate', okay ? 'ok' : 'err');
    if (okay) setEditing(null);
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Rates</h1>
        <div className="sub">
          Used by the Costing view.
          {costRates?.updatedAt
            ? ` Last saved ${dayLong(costRates.updatedAt.slice(0, 10))}${costRates.updatedBy ? ` by ${costRates.updatedBy}` : ''}.`
            : ''}
        </div>
      </div>

      {COST_RATE_GROUPS.map((group) => (
        <div key={group.title} className="panel">
          <div className="grouphead mt-0">
            {group.title}
            {group.note && <span className="muted font-normal"> ({group.note})</span>}
          </div>
          {group.fields.map((field) => (
            <div key={field.key} className="field">
              <label htmlFor={`rt-${field.key}`}>
                {field.label}
                {field.unit && <span className="muted font-normal"> ({field.unit})</span>}
              </label>
              <input
                id={`rt-${field.key}`}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
              {field.hint && <div className="sub mt-1">{field.hint}</div>}
            </div>
          ))}
        </div>
      ))}

      <button type="button" className="btn block mt-1" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save rates'}
      </button>
      <div className="sub mt-2 text-center">Saved figures load automatically for everyone.</div>

      {/*
       * The ideal values were edited here once. A manager who learned them at
       * the foot of this page is told where they went, rather than being left
       * to work out that they are gone.
       */}
      <div className="sub mx-0.5 mt-4">
        Ideal values — what a shift should make — now have their own{' '}
        <NavLink to={adminPaths.ideals} className="underline">
          Ideal values
        </NavLink>{' '}
        tab.
      </div>

      <div className="grouphead">Customer selling rates</div>
      <div className="panel scroll-x mt-0 p-0">
        <table className="tt min-w-[520px]">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Grade</th>
              <th className="tnum">₹ / kg</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr
                key={`${r.customer}-${r.grade}`}
                className="cursor-pointer"
                onClick={() =>
                  setEditing({
                    customer: r.customer,
                    grade: r.grade,
                    rate: String(r.rate),
                    note: r.note ?? '',
                  })
                }
              >
                <td>{r.customer}</td>
                <td>{r.grade}</td>
                <td className="tnum">{r.rate}</td>
                <td className="muted">{r.note ?? ''}</td>
              </tr>
            ))}
            {!rates.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No negotiated rates — the standard price list applies to everyone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn ghost block mt-2.5" onClick={() => setEditing(blankRate)}>
        + Add a customer rate
      </button>

      <BoModal
        open={Boolean(editing)}
        title={editing?.customer ? `${editing.customer} · ${editing.grade}` : 'New customer rate'}
        subtitle="A rate here overrides the standard price list for that customer and grade."
        onClose={() => setEditing(null)}
        footer={
          <button type="button" className="btn" onClick={saveCustomerRate}>
            Save rate
          </button>
        }
      >
        {editing && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="cr-customer">Customer</label>
              <input
                id="cr-customer"
                value={editing.customer}
                onChange={(e) => setEditing({ ...editing, customer: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="field">
              <label htmlFor="cr-grade">Grade</label>
              <select
                id="cr-grade"
                value={editing.grade}
                onChange={(e) => setEditing({ ...editing, grade: e.target.value as DispatchGrade })}
              >
                {DISPATCH_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cr-rate">Rate per kg</label>
              <input
                id="cr-rate"
                type="number"
                inputMode="decimal"
                value={editing.rate}
                onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cr-note">Note</label>
              <input
                id="cr-note"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="e.g. ADV PYMT"
              />
            </div>
          </div>
        )}
      </BoModal>
    </>
  );
}

export default RatesPage;
