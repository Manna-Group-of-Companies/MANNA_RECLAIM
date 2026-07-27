import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchRateCard, saveRate } from '@/features/rates/ratesSlice';
import { Button, DataTable, Modal, type Column } from '@/components/ui';
import { DISPATCH_GRADES } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { num } from '@/utils/format';
import type { DispatchGrade, Rate } from '@/types/models';

const blank: Rate = { customer: '', grade: 'Coarse', rate: 0, note: '' };

/** Customer rate card, editable only from here. */
export function RatesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { rates, priceList, loading } = useAppSelector((s) => s.rates);
  const [draft, setDraft] = useState<Rate | null>(null);

  useEffect(() => {
    void dispatch(fetchRateCard());
  }, [dispatch]);

  const columns: Column<Rate>[] = [
    { key: 'customer', header: 'Customer', render: (r) => <span className="font-semibold uppercase">{r.customer}</span> },
    { key: 'grade', header: 'Grade', render: (r) => r.grade },
    { key: 'rate', header: 'Rate / kg', align: 'right', render: (r) => <span className="tnum text-brand">{num(r.rate, 2)}</span> },
    {
      key: 'list',
      header: 'List',
      align: 'right',
      render: (r) => <span className="tnum text-ink-faint">{priceList[r.grade] ?? '--'}</span>,
    },
    { key: 'note', header: 'Note', render: (r) => r.note ?? '' },
  ];

  const save = async () => {
    if (!draft) return;
    const result = await dispatch(saveRate(draft));
    notify(saveRate.fulfilled.match(result) ? 'Rate saved' : 'Could not save the rate', saveRate.fulfilled.match(result) ? 'ok' : 'err');
    setDraft(null);
  };

  return (
    <section className="panel p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Rate card</h1>
        <Button variant="primary" size="sm" onClick={() => setDraft(blank)}>
          Add rate
        </Button>
      </header>

      <DataTable
        columns={columns}
        rows={rates}
        rowKey={(r) => `${r.customer}|${r.grade}`}
        loading={loading}
        onRowClick={setDraft}
        empty="No negotiated rates - the standard list price applies"
      />

      <Modal
        open={Boolean(draft)}
        title={draft?.customer ? `${draft.customer} - ${draft.grade}` : 'New rate'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <div>
              <label className="label-caps" htmlFor="rate-customer">Customer</label>
              <input
                id="rate-customer"
                className="field-input uppercase"
                value={draft.customer}
                onChange={(e) => setDraft({ ...draft, customer: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="label-caps" htmlFor="rate-grade">Grade</label>
              <select
                id="rate-grade"
                className="field-input"
                value={draft.grade}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value as DispatchGrade })}
              >
                {DISPATCH_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-caps" htmlFor="rate-value">Rate per kg</label>
              <input
                id="rate-value"
                className="field-input tnum"
                inputMode="decimal"
                value={draft.rate}
                onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value.replace(/[^\d.]/g, '')) })}
              />
            </div>
            <div>
              <label className="label-caps" htmlFor="rate-note">Note</label>
              <input
                id="rate-note"
                className="field-input"
                value={draft.note ?? ''}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

export default RatesPage;
