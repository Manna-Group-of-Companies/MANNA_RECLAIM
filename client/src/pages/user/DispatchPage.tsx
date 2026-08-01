import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { createDispatch, fetchDispatches } from '@/features/dispatch/dispatchSlice';
import { fetchPacked } from '@/features/machines/runsSlice';
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
  QualityChip,
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
import type { DispatchGrade, Rate, Run } from '@/types/models';

interface Item {
  grade: DispatchGrade;
  batchNo: string;
  sacks: string;
  weight: string;
  /**
   * The packed run these sacks were taken off, when the line was filled from
   * stock rather than typed. It is what draws that stock down, so an item
   * carrying one is counted in sacks and never in a loose weight.
   */
  runId?: string;
}

const blankItem: Item = { grade: 'Special', batchNo: '', sacks: '', weight: '' };

const itemKg = (item: Item) =>
  item.weight.trim() ? Number(item.weight) || 0 : (Number(item.sacks) || 0) * SACK_KG;

/** What a packed run is bagged as - the coarse line carries no quality. */
const gradeOf = (run: Run): DispatchGrade =>
  (run.quality as DispatchGrade | null) ?? 'Coarse';

/** How a stock chip names itself: the batch, or the shift for a coarse run. */
const stockRef = (run: Run) => run.batch_no ?? dayMonth(run.shift_date);

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
  const stock = useAppSelector((s) => s.runs.packed);
  const held = useAppSelector((s) => s.quality.held);

  const [building, setBuilding] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item>(blankItem);
  const [customer, setCustomer] = useState('');
  /** Ours, or hired / the customer's - the plant bills the two differently. */
  const [ownVehicle, setOwnVehicle] = useState(true);
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchDispatches(undefined));
    void dispatch(fetchRateCard());
    void dispatch(fetchPacked());
  }, [dispatch]);

  const customerList = customers.length ? customers : CUSTOMERS;

  /**
   * The vehicles and drivers already on record, offered as suggestions. Our own
   * lorries come round again and again, so the yard types a number once and
   * picks it from then on; a hired vehicle is usually new every time.
   */
  const seen = useMemo(() => {
    const own = new Set<string>();
    const hired = new Set<string>();
    const drivers = new Set<string>();
    for (const load of loads) {
      if (load.vehicle) (load.own_vehicle ? own : hired).add(load.vehicle);
      if (load.driver) drivers.add(load.driver);
    }
    return { own: [...own], hired: [...hired], drivers: [...drivers] };
  }, [loads]);

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

  /** Sacks of each packed run this load has already claimed. */
  const claimed = useMemo(() => {
    const taken: Record<string, number> = {};
    for (const item of items) {
      if (item.runId) taken[item.runId] = (taken[item.runId] ?? 0) + (Number(item.sacks) || 0);
    }
    return taken;
  }, [items]);

  /** What is left of a run's packed sacks once this load is counted against it. */
  const availOf = (run: Run) => (run.avail_sacks ?? 0) - (claimed[run.id] ?? 0);

  const available = stock.filter((run) => availOf(run) > 0);

  /** What is bagged and waiting altogether - the yard's own running total. */
  const readySacks = available.reduce((sum, run) => sum + availOf(run), 0);

  /**
   * Fills the item form from packed stock, all of what is left of it. The sacks
   * stay editable, so part of a batch can go out and the rest stay in the yard.
   */
  const takeFromStock = (run: Run) => {
    setDraft({
      grade: gradeOf(run),
      batchNo: run.batch_no ?? '',
      sacks: String(availOf(run)),
      weight: '',
      runId: run.id,
    });
  };

  /** The ready list's own button: open a load with that stock already on it. */
  const dispatchStock = (run: Run) => {
    takeFromStock(run);
    setBuilding(true);
  };

  const addItem = () => {
    const fromStock = stock.find((run) => run.id === draft.runId);
    if (fromStock) {
      const sacks = Number(draft.sacks) || 0;
      // Stock goes out in sacks - that is what draws it down - so a loose
      // weight is not a way of taking it off the yard.
      if (sacks <= 0) {
        notify('Enter the sacks going out of this stock', 'warn');
        return;
      }
      if (sacks > availOf(fromStock)) {
        notify(`Only ${availOf(fromStock)} sacks left of ${stockRef(fromStock)}`, 'warn');
        return;
      }
    } else if (!itemKg(draft)) {
      notify('Enter sacks or a weight', 'warn');
      return;
    }
    setItems([...items, { ...draft, weight: fromStock ? '' : draft.weight }]);
    setDraft({ ...blankItem, grade: draft.grade });
  };

  const reset = () => {
    setBuilding(false);
    setItems([]);
    setDraft(blankItem);
    setCustomer('');
    setOwnVehicle(true);
    setVehicle('');
    setDriver('');
  };

  /** Switching sides clears the pair - a hired number is not one of ours. */
  const setVehicleMode = (own: boolean) => {
    if (own === ownVehicle) return;
    setOwnVehicle(own);
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
    if (!vehicle.trim()) {
      notify(ownVehicle ? 'Pick the vehicle' : 'Enter the vehicle number', 'warn');
      return;
    }
    // Our own lorry always leaves with one of our drivers; on a hired vehicle
    // the driver is the customer's to name, so it stays optional.
    if (ownVehicle && !driver.trim()) {
      notify('Pick the driver for our vehicle', 'warn');
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
            own_vehicle: ownVehicle,
            driver: driver.trim() || null,
            total_kg: itemKg(item),
            sacks: Number(item.sacks) || null,
            // The packed run the sacks came off, so the yard's stock is drawn
            // down by what left it; null on a line that was typed in by hand.
            run_id: item.runId ?? null,
            batch_no: item.batchNo.trim() || null,
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
    // What went out is no longer in the yard - read the stock back as it stands.
    void dispatch(fetchPacked());
    reset();
  };

  const heldOnLoad = items.filter((i) => i.batchNo && held.includes(i.batchNo));

  if (loading && !loads.length) return <PageLoader label="Loading dispatches" />;

  return (
    <>
      <ViewHead
        title="Dispatch"
        meta={`${loads.length} load${loads.length === 1 ? '' : 's'}${
          readySacks ? ` · ${readySacks} sacks ready` : ''
        }`}
      />

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

      {/*
        What packing has bagged and nothing has carried away yet. The Packing
        tab hands the sacks over here the moment they are counted, so the yard
        reads what it can load off this tab instead of off a tally sheet - and
        each row opens a dispatch with that stock already on it.
      */}
      {available.length > 0 && (
        <>
          <div className="wsec">
            <div>
              <b>Packed &amp; ready</b>{' '}
              <small>
                — {readySacks} sack{readySacks === 1 ? '' : 's'} · {kg(readySacks * SACK_KG)} in the
                yard
              </small>
            </div>
          </div>
          <div className="stack mb-3.5">
            {available.map((run) => (
              <div key={run.id} className="wcard">
                <div className="info">
                  <div className="row1">
                    <BatchRef>{stockRef(run)}</BatchRef>
                    <QualityChip quality={gradeOf(run)} />
                    {run.formulation && <FormChip>{run.formulation}</FormChip>}
                  </div>
                  <small>
                    {availOf(run)} sacks · {availOf(run) * SACK_KG} kg ready
                    {run.dispatched_sacks
                      ? ` · ${run.dispatched_sacks} of ${run.packed_sacks} already gone`
                      : ''}
                  </small>
                </div>
                <Button variant="primary" onClick={() => dispatchStock(run)}>
                  Dispatch ▸
                </Button>
              </div>
            ))}
          </div>
        </>
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
                {load.driver ? ` · ${load.driver}` : ''}
                {load.own_vehicle != null && (
                  <span className="muted"> ({load.own_vehicle ? 'our vehicle' : 'hired'})</span>
                )}{' '}
                {load.batch_no ? `· Batch ${load.batch_no} ` : ''}
                {load.sacks ? `· ${load.sacks} sacks ` : ''}· {kg(load.total_kg)} ·{' '}
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
        led="var(--led-brand)"
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

        <SheetLabel>Packed stock</SheetLabel>
        {available.length ? (
          <>
            <PickGrid>
              {available.map((run) => (
                <Pick
                  key={run.id}
                  title={`${gradeOf(run)} · ${stockRef(run)}`}
                  sub={`${availOf(run)} sacks · ${availOf(run) * SACK_KG} kg`}
                  selected={draft.runId === run.id}
                  onClick={() => takeFromStock(run)}
                />
              ))}
            </PickGrid>
            <div className="hint">
              Tap what is going out - it fills the line below. Send part of it by changing the
              sacks; the rest stays in the yard.
            </div>
          </>
        ) : (
          <div className="hint">
            {stock.length
              ? 'All the packed sacks are on this load already.'
              : 'Nothing bagged and waiting. Pack a weighed batch and it turns up here.'}
          </div>
        )}

        <div className="field-inline mt-2 items-stretch">
          <SelectField
            label="Grade"
            value={draft.grade}
            onChange={(e) =>
              // Off the picked stock's own grade, so the line is no longer that
              // stock's - it saves as a hand-typed one and draws nothing down.
              setDraft({ ...draft, grade: e.target.value as DispatchGrade, runId: undefined })
            }
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
            onChange={(e) => setDraft({ ...draft, batchNo: e.target.value, runId: undefined })}
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
            // Stock leaves the yard in sacks - that is what is counted off it.
            disabled={Boolean(draft.runId)}
            value={draft.runId ? '' : draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value.replace(/[^\d.]/g, '') })}
            fieldClassName="!mb-0"
          />
          <Button variant="elec" className="self-end" onClick={addItem}>
            + Add
          </Button>
        </div>
        <div className="hint">
          1 sack = {SACK_KG} kg.{' '}
          {draft.runId
            ? 'Taken off packed stock, so it goes out in sacks.'
            : 'Enter sacks or a direct weight.'}
        </div>

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
        <div className="mb-2.5 flex gap-2">
          <Pick
            className="flex-1"
            title="Our vehicle"
            selected={ownVehicle}
            onClick={() => setVehicleMode(true)}
          />
          <Pick
            className="flex-1"
            title="Hired / customer"
            selected={!ownVehicle}
            onClick={() => setVehicleMode(false)}
          />
        </div>
        <datalist id="dl-vehicles">
          {(ownVehicle ? seen.own : seen.hired).map((no) => (
            <option key={no} value={no} />
          ))}
        </datalist>
        <datalist id="dl-drivers">
          {seen.drivers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="field-inline">
          <TextField
            label={ownVehicle ? 'Our vehicle' : 'Vehicle number'}
            list="dl-vehicles"
            autoComplete="off"
            placeholder={ownVehicle ? 'e.g. KL-17-AB-1234' : 'e.g. KL-43-TT-9090'}
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value.toUpperCase())}
            fieldClassName="!mb-0"
          />
          <TextField
            label="Driver"
            note={ownVehicle ? undefined : 'opt.'}
            list="dl-drivers"
            autoComplete="off"
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
