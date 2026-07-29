import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { createDispatch, fetchDispatches } from '@/features/dispatch/dispatchSlice';
import { fetchRateCard } from '@/features/rates/ratesSlice';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FormChip,
  PageLoader,
  Pick,
  PickGrid,
  Readout,
  SelectField,
  SheetLabel,
  TextField,
  ViewHead,
} from '@/components/ui';
import { CUSTOMERS, DISPATCH_GRADES, SACK_KG } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { kg, rupees } from '@/utils/format';
import { dayMonth, todayISO } from '@/utils/date';
import type { DispatchGrade, Rate } from '@/types/models';

interface Item {
  grade: DispatchGrade;
  batchNo: string;
  sacks: string;
  weight: string;
}

const blankItem: Item = { grade: 'Special', batchNo: '', sacks: '', weight: '' };

const itemKg = (item: Item) =>
  item.weight.trim() ? Number(item.weight) || 0 : (Number(item.sacks) || 0) * SACK_KG;

/** Customer's negotiated rate if there is one, otherwise the list price. */
function rateFor(rates: Rate[], priceList: Record<string, number>, customer: string, grade: string) {
  const custom = rates.find((r) => r.customer === customer && r.grade === grade);
  if (custom) return { rate: custom.rate, note: custom.note ?? '', custom: true };
  const list = priceList[grade];
  return { rate: list ?? null, note: '', custom: false };
}

/**
 * Outward loads. A vehicle leaves with one customer, one driver and any mix
 * of grades, but the API keys a dispatch to a single grade - so one load is
 * filed as one dispatch row per grade, all sharing the vehicle and date.
 */
export function DispatchPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { items: loads, loading } = useAppSelector((s) => s.dispatch);
  const { rates, customers, priceList } = useAppSelector((s) => s.rates);
  const held = useAppSelector((s) => s.quality.held);

  const [building, setBuilding] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item>(blankItem);
  const [customer, setCustomer] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchDispatches(undefined));
    void dispatch(fetchRateCard());
  }, [dispatch]);

  const customerList = customers.length ? customers : CUSTOMERS;

  const totals = useMemo(() => {
    let weight = 0;
    let amount = 0;
    let missing = false;
    for (const item of items) {
      const w = itemKg(item);
      weight += w;
      const { rate } = rateFor(rates, priceList, customer, item.grade);
      if (rate != null) amount += rate * w;
      else if (customer) missing = true;
    }
    return { kg: Math.round(weight * 100) / 100, amount: Math.round(amount * 100) / 100, missing };
  }, [items, customer, rates, priceList]);

  const addItem = () => {
    if (!itemKg(draft)) {
      notify('Enter sacks or a weight', 'warn');
      return;
    }
    setItems([...items, draft]);
    setDraft({ ...blankItem, grade: draft.grade });
  };

  const reset = () => {
    setBuilding(false);
    setItems([]);
    setDraft(blankItem);
    setCustomer('');
    setVehicle('');
    setDriver('');
  };

  const save = async () => {
    if (!items.length) {
      notify('Add at least one item', 'warn');
      return;
    }
    if (!customer) {
      notify('Pick a customer', 'warn');
      return;
    }
    setSaving(true);
    // The money is left to the server: it prices each row off the rate card
    // when it reads it back, so a later rate correction reprices the history.
    const results = await Promise.all(
      items.map((item) =>
        dispatch(
          createDispatch({
            customer,
            grade: item.grade,
            dispatch_date: todayISO(),
            vehicle: vehicle.trim() || null,
            driver: driver.trim() || null,
            total_kg: itemKg(item),
            status: 'dispatched',
            remarks: item.batchNo ? `Batch ${item.batchNo}` : null,
          }),
        ),
      ),
    );
    setSaving(false);
    const failed = results.filter((r) => r.meta.requestStatus !== 'fulfilled').length;
    if (failed) {
      notify(`${failed} of ${items.length} lines could not be saved`, 'err');
      return;
    }
    notify(`${customer} · ${totals.kg} kg dispatched`, 'ok');
    reset();
  };

  const heldOnLoad = items.filter((i) => i.batchNo && held.includes(i.batchNo));

  if (loading && !loads.length) return <PageLoader label="Loading dispatches" />;

  return (
    <>
      <ViewHead title="Dispatch" meta={`${loads.length} load${loads.length === 1 ? '' : 's'}`} />

      <Button variant="primary" size="lg" className="mb-3.5" onClick={() => setBuilding(true)}>
        + New dispatch
      </Button>

      {held.length > 0 && (
        <div className="panel mb-3.5" style={{ borderColor: 'var(--err)', background: 'rgba(220,60,60,.08)' }}>
          <b style={{ color: 'var(--err)' }}>QC hold — marked unfit</b>
          <div className="bhint">{held.map((b) => `Batch ${b}`).join(' · ')}</div>
          <div className="hint">You can still dispatch these — check with QC and decide.</div>
        </div>
      )}

      {!loads.length ? (
        <EmptyState
          icon={icons.dispatch}
          title="No dispatches yet"
          hint="Tap “New dispatch”, add the grades going out, then pick the customer, vehicle and driver."
        />
      ) : (
        <div className="stack">
          {loads.map((load) => (
            <div key={load.id} className="bcard">
              <div className="bhead">
                <div className="l">
                  <BatchRef className="text-[15px]">{load.customer}</BatchRef>
                  <FormChip>{load.grade}</FormChip>
                </div>
                <span className="bstate ready" style={{ background: 'none', color: 'var(--ok)' }}>
                  {rupees(load.amount)}
                </span>
              </div>
              <div className="bhint">
                {load.vehicle ?? 'no vehicle'}
                {load.driver ? ` · ${load.driver}` : ''} · {kg(load.total_kg)} ·{' '}
                {dayMonth(load.dispatch_date)}
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomSheet
        open={building}
        title="New dispatch"
        subtitle="One customer, one vehicle, one driver — any mix of grades."
        led="radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber))"
        onClose={reset}
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save dispatch
            </Button>
          </>
        }
      >
        <SheetLabel>Items</SheetLabel>
        {items.length ? (
          items.map((item, i) => {
            const { rate, note } = rateFor(rates, priceList, customer, item.grade);
            const weight = itemKg(item);
            const onHold = Boolean(item.batchNo && held.includes(item.batchNo));
            return (
              <div
                key={`${item.grade}-${i}`}
                className="weighrow mb-1.5"
                style={onHold ? { borderLeft: '3px solid var(--err)' } : undefined}
              >
                <span>
                  <b>{item.grade}</b>
                  {item.batchNo && <span className="muted"> {item.batchNo}</span>}
                  {onHold && <span className="qchip hold ml-1.5 text-[9px]">QC HOLD</span>} ·{' '}
                  {item.sacks ? `${item.sacks} sacks · ` : ''}
                  {weight} kg
                </span>
                <span className="flex items-center gap-2">
                  {rate != null ? (
                    <>
                      {rupees(rate * weight)}{' '}
                      <small className="muted">
                        @{rate}
                        {note ? ` ${note}` : ''}
                      </small>
                    </>
                  ) : (
                    <small style={{ color: 'var(--err)' }}>no rate</small>
                  )}
                  <button
                    type="button"
                    className="wdel"
                    aria-label="Remove item"
                    onClick={() => setItems(items.filter((_, index) => index !== i))}
                  >
                    ✕
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <div className="hint">No items yet. Add each grade going on this vehicle.</div>
        )}

        <div className="field-inline mt-2 items-stretch">
          <SelectField
            label="Grade"
            value={draft.grade}
            onChange={(e) => setDraft({ ...draft, grade: e.target.value as DispatchGrade })}
            fieldClassName="!mb-0"
          >
            {DISPATCH_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Batch"
            note="opt."
            placeholder="—"
            value={draft.batchNo}
            onChange={(e) => setDraft({ ...draft, batchNo: e.target.value })}
            fieldClassName="!mb-0"
          />
        </div>

        <div className="field-inline mt-2.5 items-stretch">
          <TextField
            label="Sacks"
            inputMode="numeric"
            placeholder="0"
            value={draft.sacks}
            onChange={(e) => setDraft({ ...draft, sacks: e.target.value.replace(/[^\d]/g, '') })}
            fieldClassName="!mb-0"
          />
          <TextField
            label="or Weight"
            inputMode="decimal"
            suffix="kg"
            placeholder="kg"
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value.replace(/[^\d.]/g, '') })}
            fieldClassName="!mb-0"
          />
          <Button variant="elec" className="self-end" onClick={addItem}>
            + Add
          </Button>
        </div>
        <div className="hint">1 sack = {SACK_KG} kg. Enter sacks or a direct weight.</div>

        <SheetLabel>Customer</SheetLabel>
        <PickGrid>
          {customerList.map((name) => (
            <Pick
              key={name}
              title={name}
              selected={customer === name}
              onClick={() => setCustomer(name)}
            />
          ))}
        </PickGrid>

        <SheetLabel>Vehicle</SheetLabel>
        <div className="field-inline">
          <TextField
            label="Vehicle number"
            placeholder="e.g. KL-43-TT-9090"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value.toUpperCase())}
            fieldClassName="!mb-0"
          />
          <TextField
            label="Driver"
            note="opt."
            placeholder="driver name"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            fieldClassName="!mb-0"
          />
        </div>

        {heldOnLoad.length > 0 && (
          <div className="formwarn show mt-3">
            <b>QC hold:</b> {heldOnLoad.map((i) => i.batchNo).join(', ')} was marked unfit. Check
            with QC before this leaves.
          </div>
        )}

        {customer ? (
          <Readout
            label="Total"
            value={
              <>
                {totals.kg} kg · {rupees(totals.amount)}
                {totals.missing && (
                  <small style={{ color: 'var(--err)' }}> (some grades have no rate)</small>
                )}
              </>
            }
            valueColor="var(--ok)"
            className="mt-3.5"
          />
        ) : (
          <div className="hint mt-3">Pick a customer to price the load.</div>
        )}
      </BottomSheet>
    </>
  );
}

export default DispatchPage;
