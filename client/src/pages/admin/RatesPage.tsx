import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  fetchCostRates,
  fetchIdealValues,
  fetchRateCard,
  saveCostRates,
  saveIdealValues,
  saveRate,
} from '@/features/rates/ratesSlice';
import { BoModal } from '@/components/ui';
import { COST_RATE_GROUPS, DISPATCH_GRADES, IDEAL_VALUE_GROUPS } from '@/config/constants';
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
 * priced from. The plant's ideal values sit under them - what a shift *should*
 * make, as against what a thing costs - and the customer selling rates under
 * those, since they are the other half of "rates" and have nowhere else to be
 * edited.
 */
export function RatesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { rates, costRates, idealValues, saving, savingIdeals } = useAppSelector((s) => s.rates);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [values, setValues] = useState<Record<string, string>>({});
  const [ideals, setIdeals] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<typeof blankRate | null>(null);

  useEffect(() => {
    void dispatch(fetchCostRates());
    void dispatch(fetchIdealValues());
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

  // The same rule for the benchmarks, and separately: the two halves of this
  // page are saved by their own buttons, so seeding them together would let a
  // refresh land in one while the other is being typed.
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

  /**
   * Saved on its own button rather than with the cost rates above. They are two
   * different statements - what a thing costs, and what a shift ought to make -
   * and a manager correcting a firewood rate should not also be re-posting every
   * target on the page.
   */
  const saveIdeals = async () => {
    const data = toNumbers(ideals);
    if (anyNotANumber(data)) {
      notify('Every ideal value has to be a number', 'warn');
      return;
    }
    const negative = Object.values(data).some((v) => v != null && v < 0);
    if (negative) {
      notify('An ideal value cannot be negative', 'warn');
      return;
    }
    const result = await dispatch(saveIdealValues(data));
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Ideal values saved' : 'Could not save the ideal values', okay ? 'ok' : 'err');
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

      <div className="mx-0.5 mt-5">
        <h1 className="text-lg">Ideal values</h1>
        <div className="sub">
          What the plant should be making. The Efficiency tab shows every figure it collects beside
          its ideal here, flags the ones that fall short, and asks for a reason.
          {idealValues?.updatedAt
            ? ` Last saved ${dayLong(idealValues.updatedAt.slice(0, 10))}${idealValues.updatedBy ? ` by ${idealValues.updatedBy}` : ''}.`
            : ''}
        </div>
        <div className="sub mt-1">
          Leave a figure blank and nothing is compared against it — a blank is “no target set”, not
          a target of zero.
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

      <button type="button" className="btn block mt-1" onClick={saveIdeals} disabled={savingIdeals}>
        {savingIdeals ? 'Saving…' : 'Save ideal values'}
      </button>

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
