import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchRunFilters } from '@/features/reports/reportsSlice';
import { requestRefresh } from '@/features/ui/uiSlice';
import { runService } from '@/api/services/run.service';
import { dispatchService } from '@/api/services/dispatch.service';
import { toRequestError } from '@/api/axiosClient';
import {
  BottomSheet,
  Button,
  FieldRow,
  FormWarning,
  PageLoader,
  QualityChip,
  SearchSelectField,
  SelectField,
  SheetLabel,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import {
  buildPayload,
  changedFields,
  deletedSummary,
  draftOf,
  round2,
  runMath,
  text,
  type Draft,
} from '@/features/history/runDraft';
import {
  DISPATCH_ROLES,
  QUALITIES,
  SHIFTS,
  TYRES,
  counted,
  type TyreType,
} from '@/config/constants';
import { useSupervisor } from '@/hooks/useSupervisor';
import { useToast } from '@/hooks/useToast';
import { clock24, dayMonth } from '@/utils/date';
import { hours, kwhOf, num, rupees } from '@/utils/format';
import type { DispatchSummary, Run } from '@/types/models';

/** "9.3 h" the way the prototype's history column reads it. */
const runHours = (run: Run) => {
  const h = hours(run);
  return h == null ? '—' : `${num(h, 1)} h`;
};

/** Nothing recorded reads as a dash rather than as an empty gap. */
const show = (value: ReactNode) => (value == null || value === '' ? '—' : value);

/** "29 Jul 12:35" - the day and the 24-hour clock the shop floor reads. */
const stamp = (iso?: string | null) => (iso ? `${dayMonth(iso)} ${clock24(iso)}` : null);

/** Run time is edited in minutes, the way the sheet asks for it; kept in hours. */
const minutesOf = (hoursText: string) => {
  if (!hoursText.trim()) return '';
  const h = Number(hoursText);
  return Number.isNaN(h) ? hoursText : String(Math.round(h * 60));
};

/** One line of the Full record: what it is on the left, what it reads right. */
function Det({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="detrow">
      <span className="k">{k}</span>
      <span className="v">{show(v)}</span>
    </div>
  );
}

/**
 * The prototype's Edit entry sheet: the run opens straight into its own form,
 * with everything that is not editable read out underneath it.
 *
 * The fields on offer follow what was actually recorded. A shiftwise run - the
 * grinding and coarse lines, measured by the shift rather than by the batch -
 * has no batch or grade to correct, so it is not asked for one; an autoclave is
 * timed by its charge rather than by a meter, so it gets neither meter group.
 *
 * Both writes rewrite the plant's record, so the sheet is what stands in for
 * the role check the API used to make: what a reading works out to is shown
 * under it before it is saved, and the delete names the entry it is about to
 * remove and waits to be told again.
 */
function RunSheet({
  run,
  onClose,
  onSaved,
  onDeleted,
}: {
  run: Run | null;
  onClose: () => void;
  onSaved: (run: Run) => void;
  onDeleted: (id: string) => void;
}) {
  const notify = useToast();
  const dispatch = useAppDispatch();
  const machines = useAppSelector((s) => s.machines.items);
  const [mode, setMode] = useState<'edit' | 'delete'>('edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A different run in the sheet starts fresh: its own form, no half-typed
  // correction carried over, and never mid-delete.
  const runId = run?.id ?? '';
  useEffect(() => {
    setMode('edit');
    setDraft(run ? draftOf(run) : null);
    setError('');
  }, [runId, run]);

  const machine = run ? machines.find((m) => m.id === run.machine_id) : undefined;
  // The title wears the short name the tablets label the machine with; the
  // full name and the id are read out under Full record.
  const label = run ? machine?.short ?? run.machine ?? run.machine_id : '';
  const when = run ? `${dayMonth(run.shift_date)}${run.shift ? ` · ${run.shift}` : ''}` : '';

  const close = () => {
    setMode('edit');
    onClose();
  };

  const save = async () => {
    if (!run || !draft) return;
    const math = runMath(run, draft);
    if (math.issues.length) return;

    const changed = changedFields(draft, draftOf(run));
    const payload = buildPayload(draft, changed, math);
    if (!Object.keys(payload).length) {
      notify(
        changed.length ? 'Nothing left to save once the readings are applied' : 'Nothing changed',
        'warn',
      );
      return;
    }

    setBusy(true);
    setError('');
    try {
      onSaved(await runService.update(run.id, payload));
      /*
       * And tell the rest of the app to re-read itself, for the same reason the
       * delete below does.
       *
       * `onSaved` swaps this one row in this one table and nothing else. What a
       * correction moves is added up from these rows elsewhere - the shift's
       * output on Reports, the energy and the cost on the dashboard, the hours
       * behind Efficiency - so a tab that is already mounted goes on showing the
       * figure it added up before the correction until somebody reloads the app.
       */
      dispatch(requestRefresh());
      notify('Entry updated', 'ok');
      close();
    } catch (err) {
      const message = toRequestError(err).message;
      setError(message);
      notify(message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!run) return;
    setBusy(true);
    setError('');
    try {
      // What went with it - the sacks off its stock group, the samples off the
      // lab's table - rather than "deleted" and nothing about the yard moving.
      const { message, warn } = deletedSummary(await runService.remove(run.id));
      onDeleted(run.id);
      /*
       * And tell the rest of the app to re-read itself.
       *
       * `onDeleted` takes the row out of this list and nothing else. A delete
       * moves the yard as well - the sacks come off a stock group, and the
       * group goes entirely when the run was the only thing in it - so a Stock
       * tab that is already mounted goes on drawing a card for stock that no
       * longer exists until somebody reloads the app. That is the same reason
       * filing a lab verdict bumps this, and the same fix.
       */
      dispatch(requestRefresh());
      notify(message, warn ? 'warn' : 'ok');
      close();
    } catch (err) {
      const message = toRequestError(err).message;
      setError(message);
      notify(message, 'err');
      setMode('edit');
    } finally {
      setBusy(false);
    }
  };

  /* ---- the delete confirmation, which replaces the form ---- */

  if (mode === 'delete') {
    return (
      <BottomSheet
        open={Boolean(run)}
        title="Delete this entry?"
        subtitle={
          <>
            <span className="batchref">{label}</span> · {when}
          </>
        }
        led="var(--led-err)"
        onClose={close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('edit')} disabled={busy}>
              Keep entry
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Yes, delete
            </Button>
          </>
        }
      >
        <div className="hint">
          Permanently removes this entry from the plant's record. The production, energy and cost
          figures it counts towards drop with it. This cannot be undone.
        </div>
        {error && <FormWarning>{error}</FormWarning>}
      </BottomSheet>
    );
  }

  /* ---- Edit entry ---- */

  const form = () => {
    if (!run || !draft) return null;

    const math = runMath(run, draft);
    const { isAuto, isPress, elecPair, hourPair, elecDelta, hourDelta } = math;
    const { isCracker, pickingLabourHours } = math;
    // Shiftwise: the lines whose output is measured by the shift rather than by
    // the batch, so there is no batch or grade against the run to correct.
    const isShiftwise = run.line === 'grind' || run.line === 'coarse';
    const hasBatchFields = !isShiftwise || Boolean(run.batch_no) || Boolean(run.quality);

    const set = (field: keyof Draft, value: string) => setDraft({ ...draft, [field]: value });
    const number = (field: keyof Draft, label_: ReactNode, note?: ReactNode, suffix?: string) => (
      <TextField
        label={label_}
        note={note}
        inputMode="decimal"
        suffix={suffix}
        placeholder="—"
        value={draft[field]}
        onChange={(e) => set(field, e.target.value)}
      />
    );

    const runtimeField = (
      <TextField
        label="Run time"
        note="(min)"
        inputMode="decimal"
        placeholder="—"
        value={hourPair ? String(Math.round((hourDelta ?? 0) * 60)) : minutesOf(draft.hoursRun)}
        disabled={hourPair}
        onChange={(e) => {
          const typed = e.target.value.trim();
          const mins = Number(typed);
          set('hoursRun', !typed ? '' : Number.isNaN(mins) ? typed : String(round2(mins / 60)));
        }}
      />
    );

    const tyre = run.tyre_type ? TYRES[run.tyre_type as TyreType] : null;

    return (
      <>
        {hasBatchFields && (
          <>
            <TextField
              label={isShiftwise ? 'Coarse batch number' : 'Batch number'}
              value={draft.batchNo}
              onChange={(e) => set('batchNo', e.target.value)}
            />
            {/* A press moulds finished goods, not a grade of reclaim: it has
                neither a quality nor a formulation to correct. */}
            {!isPress && (
              <>
                <SelectField
                  label="Quality"
                  value={draft.quality}
                  onChange={(e) => set('quality', e.target.value)}
                >
                  <option value="">—</option>
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Formulation"
                  value={draft.formulation}
                  onChange={(e) => set('formulation', e.target.value)}
                />
              </>
            )}
          </>
        )}

        <SheetLabel className="!mt-2">Shift</SheetLabel>
        <FieldRow className="mb-3.5">
          <SelectField label="Shift" value={draft.shift} onChange={(e) => set('shift', e.target.value)}>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Shift date"
            type="date"
            value={draft.shiftDate}
            onChange={(e) => set('shiftDate', e.target.value)}
          />
        </FieldRow>
        <TextField
          label="Supervisor"
          value={draft.supervisor}
          onChange={(e) => set('supervisor', e.target.value)}
        />

        {isAuto ? (
          <>
            <SheetLabel>Charge</SheetLabel>
            <FieldRow className="mb-3.5">
              {runtimeField}
              {number('workers', 'Workers')}
            </FieldRow>
            {number('capacity', 'Charge', '(kg)')}
            {number('firewoodKg', 'Firewood', '(kg)')}
          </>
        ) : isPress ? (
          /* A press: what came out of the mould, and what it was moulded at. No
             meters and no energy - it records neither. Material re-costs itself
             off the weight, the flash and the count, at the rate the run was
             moulded under. */
          <>
            <SheetLabel>Moulded</SheetLabel>
            <FieldRow className="mb-3.5">
              {number('pieces', 'How many', '(nos)')}
              {number('workers', 'Workers')}
            </FieldRow>
            <FieldRow className="mb-3.5">
              {number('outWeight', 'Weight', '(kg)', 'kg')}
              {number('flashKg', 'Flash', '(kg)', 'kg')}
            </FieldRow>
            <FieldRow className="mb-3.5">
              {number('cyclicMin', 'Cyclic time', '(min)')}
              {number('cavities', 'Cavities')}
            </FieldRow>
            {/* No run time here: a press books none. What it ran is its start and
                stop, read out under Full record. */}
            <div className="diffout show">
              {math.material == null
                ? 'No compound rate against this run, so it carries no material cost.'
                : `Material: ${draft.outWeight || 0} + ${draft.flashKg || 0} kg × ₹${run.compound_rate} = ₹${math.material}${
                    math.perPiece != null ? ` · ₹${math.perPiece} a piece` : ''
                  }`}
            </div>
          </>
        ) : (
          <>
            <SheetLabel>Hour meter</SheetLabel>
            {number('hourStart', 'Start reading', undefined, 'hrs')}
            {number('hourEnd', 'Stop reading', undefined, 'hrs')}
            {hourDelta != null && (
              <div className={`diffout show${hourDelta < 0 ? ' bad' : ''}`}>
                {hourDelta < 0
                  ? 'The hour meter reads lower at the stop than at the start.'
                  : `Run: ${draft.hourEnd} − ${draft.hourStart} = ${hourDelta} hrs`}
              </div>
            )}
            <FieldRow className="mb-3.5 mt-2.5">
              {runtimeField}
              {number('workers', 'Workers')}
            </FieldRow>

            <SheetLabel>Electricity meter</SheetLabel>
            {number('elecStart', 'Start reading', undefined, 'units')}
            {number('elecEnd', 'Final reading', undefined, 'units')}
            {elecDelta != null && (
              <div className={`diffout show${elecDelta < 0 ? ' bad' : ''}`}>
                {elecDelta < 0
                  ? 'The electricity meter reads lower at the end than at the start.'
                  : `Consumed: ${draft.elecEnd} − ${draft.elecStart} = ${elecDelta} units`}
              </div>
            )}
            <TextField
              label="Energy"
              note="(kWh) — recalculated when a reading changes"
              inputMode="decimal"
              placeholder="—"
              value={elecPair ? text(math.energy) : draft.kwh}
              onChange={(e) => set('kwh', e.target.value)}
              disabled={elecPair}
              fieldClassName="mt-2.5"
            />
          </>
        )}

        {/* A press has already been asked for its weight above, and nothing off a
            press is bagged - there is no packing path from it. */}
        {!isPress && number('outWeight', 'Output weight', '(kg) — blank = none')}
        {!isPress && number('packedSacks', 'Packed sacks')}

        {/* The yard gang that fed the cracker. What went in at the machine was an
            estimate at the end of a shift, so it is correctable - and correcting
            it re-prices the crumb that window made, because the costing works
            the figure out from the runs rather than storing a total. */}
        {isCracker && (
          <>
            <SheetLabel>Picking — scrap yard</SheetLabel>
            <FieldRow className="mb-3.5">
              {number('pickingLabourers', 'Labourers')}
              {number('pickingHours', 'Time worked', '(hrs)', 'hrs')}
            </FieldRow>
            <div className={`diffout${pickingLabourHours != null ? ' show' : ''}`}>
              {pickingLabourHours != null
                ? `Picking: ${draft.pickingLabourers} × ${draft.pickingHours} h = ${pickingLabourHours} labourer-hours — costed into ₹/kg crumb.`
                : 'Both halves or neither — labourers on their own cost nothing.'}
            </div>
          </>
        )}
        <TextAreaField
          label="Remarks"
          rows={2}
          value={draft.remarks}
          onChange={(e) => set('remarks', e.target.value)}
        />

        <SheetLabel>Full record</SheetLabel>
        <Det k="Machine" v={`${run.machine ?? machine?.name ?? '—'} · ${run.machine_id}`} />
        <Det k="Line" v={run.line} />
        <Det
          k="Type"
          v={isAuto ? 'Autoclave' : isPress ? 'Press' : isShiftwise ? 'Shiftwise' : 'Batch'}
        />
        {isPress && (
          <>
            <Det k="Product" v={run.product} />
            <Det
              k="Moulded at"
              v={`${run.cure_temp_c != null ? `${run.cure_temp_c} °C` : 'temp not set'} · ${
                run.cyclic_min != null ? `${run.cyclic_min} min` : 'cycle not set'
              } · ${run.cavities ?? '—'} cavities`}
            />
            <Det k="Compound rate" v={run.compound_rate != null ? `₹${run.compound_rate}/kg` : null} />
            <Det
              k="Material cost"
              v={
                run.material_cost != null
                  ? `₹${run.material_cost}${run.cost_per_piece != null ? ` · ₹${run.cost_per_piece} a piece` : ''}`
                  : null
              }
            />
          </>
        )}
        <Det k="Formulation" v={run.formulation} />
        <Det k="Capacity" v={run.capacity != null ? `${run.capacity} kg` : null} />
        <Det k="Tyre" v={tyre ? `${tyre.label} ${run.mesh ?? tyre.mesh}` : run.mesh} />
        <Det k="Mix sources" v={run.sources?.length ? run.sources.join(' + ') : null} />
        <Det k="Start / end" v={`${show(stamp(run.started_at))} → ${show(stamp(run.ended_at))}`} />
        <Det k="Start/stops combined" v={run.passes ?? 1} />
        {Array.isArray(run.weigh_entries) && run.weigh_entries.length > 0 && (
          <Det k="Weighings" v={run.weigh_entries.join(' + ')} />
        )}
        {(run.leftout_in != null || run.leftout_out != null) && (
          <Det k="Carried in / out" v={`${run.leftout_in ?? 0} → ${run.leftout_out ?? 0} kg`} />
        )}
        {run.picking_labour_hours != null && (
          <Det
            k="Picking"
            v={`${run.picking_labourers} × ${run.picking_hours} h = ${run.picking_labour_hours} labourer-hours`}
          />
        )}
        {run.non_production ? <Det k="Non-production" v="Yes" /> : null}
        <Det k="Status" v={run.status === 'running' ? 'Running' : 'Logged'} />
        {/* The account the start was authenticated as. Blank on a run started
            before the column existed - see migrations/0013. */}
        <Det k="Logged by" v={run.entered_by} />
        <Det k="Record id" v={run.id} />
      </>
    );
  };

  return (
    <BottomSheet
      open={Boolean(run)}
      title={`Edit entry — ${label}`}
      subtitle={
        <>
          {when} · <span style={{ color: 'var(--ok)' }}>synced</span>
        </>
      }
      led="var(--led-elec)"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save changes
          </Button>
        </>
      }
      after={
        <Button
          variant="danger"
          size="lg"
          className="mt-2.5"
          onClick={() => setMode('delete')}
          disabled={busy}
        >
          Delete this entry
        </Button>
      }
    >
      {form()}
      {error && <FormWarning>{error}</FormWarning>}
    </BottomSheet>
  );
}

/**
 * What has left the yard lately, above the run log.
 *
 * A dispatch is the last thing that happens to a batch and the one thing the
 * crew who posted it could not see afterwards - the ledger is read per customer
 * in the back office, which is a question the floor cannot ask. Without this,
 * checking whether a document landed means posting it again.
 *
 * Newest first and short. This is "did that go through", not the sales record;
 * the amounts are here because whoever posted one typed them a minute ago.
 */
function RecentDispatches() {
  const [rows, setRows] = useState<DispatchSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const role = useAppSelector((s) => s.auth.user?.role);
  // The route refuses anyone else anyway - this is only so a worker's History
  // tab does not fire a request every time it opens to be told 403.
  const maySee = Boolean(role && DISPATCH_ROLES.includes(role));

  useEffect(() => {
    if (!maySee) return;
    let live = true;
    dispatchService
      .recent({ limit: 8 })
      .then((res) => {
        if (live) setRows(res.rows);
      })
      // Quietly: the run log underneath is the point of this tab, and a yard
      // panel that could not load is not a reason to put an error over it.
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [refreshTick, maySee]);

  if (!maySee || failed || !rows.length) return null;

  return (
    <section className="panel mb-3">
      <SheetLabel className="!mt-0">Recently dispatched</SheetLabel>
      <div className="scroll-x">
        <table className="hist min-w-[560px]">
          <thead>
            <tr>
              <th>Went to</th>
              <th>What</th>
              <th>When</th>
              <th className="text-right">Quantity</th>
              <th className="text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const byQuality = Object.entries(d.sacks_by_quality ?? {});
              return (
                <tr key={d.id}>
                  <td>
                    <b>{show(d.customer)}</b>
                    {d.lines > 1 && (
                      <div className="muted text-[10px]">{d.lines} stock groups</div>
                    )}
                  </td>
                  {/*
                    What actually left, by grade. A load is one row and usually
                    more than one product, so a sack count on its own says how
                    much went without saying what - and "did that go through" is
                    nearly always a question about one grade of it.
                  */}
                  <td>
                    {byQuality.length ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {byQuality.map(([quality, sacks]) => (
                          <span key={quality} className="inline-flex items-center gap-1">
                            <QualityChip quality={quality} />
                            <span className="muted text-[10px]">×{sacks}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {d.dispatch_date ? dayMonth(d.dispatch_date) : <span className="muted">—</span>}
                  </td>
                  {/* Sacks and pieces counted apart - a document can carry both
                      now, and adding them would be arithmetic on two different
                      quantities. */}
                  <td className="tnum">
                    {[
                      d.sacks ? counted(d.sacks, 'sacks') : null,
                      d.pieces ? counted(d.pieces, 'pieces') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || <span className="muted">—</span>}
                  </td>
                  <td className="tnum">{rupees(d.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The whole run history, not just one shift.
 *
 * Every row on record comes down - the plant has well over a thousand and the
 * crews scroll back through them - so the list is fetched with `all` rather
 * than a page at a time, and the day / shift / batch / machine pickers narrow
 * it server-side. Tapping a row opens that entry to correct or to delete.
 */
export function HistoryPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.reports.filters);
  const queued = useAppSelector((s) => s.runs.queue.length);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  /*
   * Who anything logged from this browser right now would be signed by, printed
   * over the log rather than left to be discovered in it. The two names are the
   * same on an ordinary shift; they part when the sheet's pick has been switched,
   * and that is precisely when somebody reading History needs to be told.
   */
  const { name: signingAs, account } = useSupervisor();

  const [date, setDate] = useState('');
  const [shift, setShift] = useState('');
  const [batch, setBatch] = useState('');
  const [machineId, setMachineId] = useState('');
  const [rows, setRows] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Run | null>(null);

  useEffect(() => {
    void dispatch(fetchRunFilters());
  }, [dispatch, refreshTick]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    runService
      .list({
        all: 1,
        date: date || undefined,
        shift: shift || undefined,
        batch: batch || undefined,
        machineId: machineId || undefined,
      })
      .then(({ rows: got }) => {
        if (live) setRows(got);
      })
      .catch((err) => {
        if (live) setError(toRequestError(err).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [date, shift, batch, machineId, refreshTick]);

  // Every batch on record, with "All batches" as an entry of its own rather
  // than the absence of one.
  const batchOptions = useMemo(
    () => [
      { value: '', label: 'All batches' },
      ...(filters?.batches ?? []).map((b) => ({ value: b, label: `#${b}` })),
    ],
    [filters],
  );

  // Newest first, on the same clock the shop floor reads: the shift the run
  // belongs to, then when it actually ended.
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.shift_date !== b.shift_date) return a.shift_date < b.shift_date ? 1 : -1;
        const ea = a.ended_at ?? a.started_at ?? '';
        const eb = b.ended_at ?? b.started_at ?? '';
        return ea < eb ? 1 : -1;
      }),
    [rows],
  );

  if (loading && !rows.length) return <PageLoader label="Loading history" />;

  return (
    <>
      <ViewHead
        title="History"
        meta={
          <>
            {sorted.length} shown · {queued} unsynced ·{' '}
            <span className="synced yes inline-block align-middle" /> = saved to cloud · tap a row
            to edit
            {account && (
              <div className="text-[11px]">
                Signed in as <b>{account}</b>
                {signingAs && signingAs !== account ? (
                  <>
                    {' '}
                    · signing records as <b>{signingAs}</b>
                  </>
                ) : (
                  ' · records are signed with this name'
                )}
              </div>
            )}
          </>
        }
      />

      <RecentDispatches />

      <div className="histbar">
        <SelectField
          label="Day"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          fieldClassName="!mb-0"
        >
          <option value="">All days</option>
          {filters?.days.map((d) => (
            <option key={d} value={d}>
              {dayMonth(d)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Shift"
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          fieldClassName="!mb-0"
        >
          <option value="">Both shifts</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        {/* Searched rather than scrolled, and the only picker on this bar that
            is: the other three are a screenful each, while the batch list is
            every number the plant has ever run. Every one of them is on it -
            see SearchSelectField. */}
        <SearchSelectField
          label="Batch"
          sheetTitle="Find a batch"
          searchLabel="Batch number"
          searchPlaceholder="e.g. 3079"
          value={batch}
          options={batchOptions}
          onChange={setBatch}
          fieldClassName="!mb-0"
        />
        <SelectField
          label="Machine"
          value={machineId}
          onChange={(e) => setMachineId(e.target.value)}
          fieldClassName="!mb-0"
        >
          <option value="">All machines</option>
          {filters?.machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
      </div>

      {error && (
        <div className="histsum text-state-err">Couldn’t load history: {error}</div>
      )}

      <section className="panel scroll-x">
        <table className="hist min-w-[620px]">
          <thead>
            <tr>
              <th />
              <th>Machine</th>
              <th>Batch</th>
              <th>Super</th>
              <th>Run (h)</th>
              <th>Energy</th>
              <th>Crew</th>
              <th>Weight</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const k = kwhOf(r);
              const w = r.weight_kg ?? r.out_weight ?? null;
              const hasMeter = r.elec_start != null || r.elec_end != null;
              const hasHourMeter = r.hour_start != null || r.hour_end != null;
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer"
                  aria-label={`Edit ${r.machine ?? r.machine_id} entry`}
                >
                  <td>
                    <span className="synced yes" title="Saved to cloud" />
                  </td>
                  <td>
                    <b>{r.machine ?? r.machine_id}</b>
                    <div className="muted text-[11px]">
                      {dayMonth(r.shift_date)}
                      {r.shift ? ` · ${r.shift}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className="qchip shift">{r.shift}</span>
                    {r.batch_no && <span className="batchref ml-1 text-[11px]">{r.batch_no}</span>}
                    {r.quality && <QualityChip quality={r.quality} className="ml-1" />}
                    {r.formulation && <div className="muted text-[10px]">{r.formulation}</div>}
                    {/* A press names its product, and what its pieces cost. */}
                    {r.product && (
                      <div className="muted text-[10px]">
                        {r.product}
                        {r.pieces != null ? ` · ${r.pieces} pcs` : ''}
                        {r.cost_per_piece != null ? ` · ₹${r.cost_per_piece}/pc` : ''}
                      </div>
                    )}
                  </td>
                  {/* Who was signed in when the machine was started. That name
                      comes off the access token, so it is the one thing on the
                      row nobody on the floor can switch - which is why it leads
                      rather than the sheet's pick. The pick is printed under it
                      on the one occasion it is news: when the record was signed
                      with somebody else's name. A run from before the account
                      was recorded has only the signed name to fall back on. */}
                  <td>
                    {r.entered_by ?? r.supervisor ?? <span className="muted">—</span>}
                    {r.entered_by && r.supervisor && r.supervisor !== r.entered_by && (
                      <div className="muted text-[10px]">signed as {r.supervisor}</div>
                    )}
                  </td>
                  <td className="tnum">
                    {r.status === 'running' ? 'live' : runHours(r)}
                    {hasHourMeter && (
                      <div className="muted text-[10px]">
                        hr {r.hour_start ?? '—'} → {r.hour_end ?? '—'}
                      </div>
                    )}
                    {/* A shiftwise machine keeps one record per shift, so these
                        hours are every start of it added together. */}
                    {(r.passes ?? 1) > 1 && (
                      <div className="muted text-[10px]">{r.passes} start/stops combined</div>
                    )}
                  </td>
                  <td className="tnum">
                    {k != null ? `${num(k, 0)} kWh` : '—'}
                    {r.firewood_kg != null && (
                      <div className="muted text-[10px]">{r.firewood_kg} kg fw</div>
                    )}
                    {hasMeter && (
                      <div className="muted text-[10px]">
                        meter {r.elec_start ?? '—'} → {r.elec_end ?? '—'}
                        {r.machine_id === 'GRD_O' ? ' ×3' : ''}
                      </div>
                    )}
                  </td>
                  <td className="tnum">{r.workers ?? '—'}</td>
                  <td className="tnum">
                    {w != null ? (
                      `${w} kg`
                    ) : r.needs_weigh || r.needs_weight ? (
                      <span className="muted">pending</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="muted text-right">›</td>
                </tr>
              );
            })}
            {!sorted.length && !loading && (
              <tr>
                <td colSpan={9} className="py-6 text-center">
                  <span className="muted">No runs match these filters.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <RunSheet
        run={selected}
        onClose={() => setSelected(null)}
        onSaved={(saved) => {
          // The table follows the correction straight away rather than waiting
          // for the next fetch.
          setRows((current) => current.map((r) => (r.id === saved.id ? saved : r)));
          setSelected(null);
        }}
        onDeleted={(id) => {
          setRows((current) => current.filter((r) => r.id !== id));
          setSelected(null);
        }}
      />
    </>
  );
}

export default HistoryPage;
