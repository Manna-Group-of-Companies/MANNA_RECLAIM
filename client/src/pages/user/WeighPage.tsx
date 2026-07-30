import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchPendingWeigh, fetchWeighed, weighRun } from '@/features/machines/runsSlice';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FormChip,
  PageLoader,
  QualityChip,
  Readout,
  TextField,
  ViewHead,
} from '@/components/ui';
import { TYRES, WEIGHED_PAGE, type TyreType } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { duration } from '@/utils/format';
import { clock, dayMonth } from '@/utils/date';
import type { Run } from '@/types/models';

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (values: number[]) => round2(values.reduce((total, n) => total + n, 0));

/** The weighings on record, or none where the run predates keeping them. */
const entriesOf = (run: Run) => (Array.isArray(run.weigh_entries) ? run.weigh_entries : []);

const weightOf = (run: Run) => run.weight_kg ?? run.out_weight ?? 0;

/**
 * Tapping a button does not reliably take focus off the input on the tablets,
 * so the number pad stays up and covers the sheet actions. Drop the focus by
 * hand once a weighing is banked - the pad comes back when the field is tapped.
 */
function dismissPad() {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) focused.blur();
}

/**
 * Where the material came from, as the crews name it. Shiftwise output belongs
 * to a line and a day; refiner output belongs to its batch, and the time it
 * came off is what tells two passes of the same grade apart.
 */
function sourceOf(run: Run) {
  if (run.quality) {
    const machine = run.machine ?? run.machine_id;
    const at = run.ended_at ? ` · ${machine} ${clock(run.ended_at)}` : '';
    return `${run.formulation ?? machine}${at}`;
  }
  return `${run.line === 'grind' ? 'Grinder output' : 'Coarse'} · ${dayMonth(run.shift_date)}`;
}

/** What the grinding line was fed with, for the sheets that name it. */
function feedOf(run: Run) {
  const tyre = run.tyre_type ? TYRES[run.tyre_type as TyreType]?.label : null;
  return [tyre, run.mesh].filter(Boolean).join(' ');
}

/** The line under a correction sheet's title: line, shift, day, feedstock. */
function subtitleOf(run: Run) {
  const line = run.quality
    ? run.formulation ?? run.machine ?? run.machine_id
    : run.line === 'grind'
      ? 'Grinder output'
      : 'Coarse';
  return [line, `${run.shift} shift`, dayMonth(run.shift_date), feedOf(run)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The weigh queue: runs that finished on a machine whose output is weighed
 * (the grinders, R2, R4) and that nobody has put on the scale yet.
 *
 * Material comes off in more than one barrow, so the sheet keeps a running
 * list of individual weighings and sends their total once. Until it is sent
 * the run stays here, which is what makes the tab badge trustworthy.
 *
 * Below the queue is everything already weighed, newest first. A figure typed
 * wrong is found and put right there rather than waiting on the back office,
 * and the weighings the total came off are shown alongside it.
 */
export function WeighPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { pendingWeigh, weighed, weighedTotal, weighedAll, loading } = useAppSelector((s) => s.runs);
  const [target, setTarget] = useState<Run | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [entries, setEntries] = useState<number[]>([]);
  const [weight, setWeight] = useState('');
  /** The figure of record a correction will save; blank on a first weighing. */
  const [total, setTotal] = useState('');

  useEffect(() => {
    void dispatch(fetchPendingWeigh());
    void dispatch(fetchWeighed({}));
  }, [dispatch]);

  const entriesTotal = sum(entries);

  const open = (run: Run) => {
    setTarget(run);
    setCorrecting(false);
    // A shiftwise machine banks each load as it comes off, so a run can arrive
    // here with its weighings already against it - this tab is where they are
    // totalled and filed rather than where they are all typed.
    setEntries(entriesOf(run));
    setWeight('');
    setTotal('');
  };

  const openCorrection = (run: Run) => {
    setTarget(run);
    setCorrecting(true);
    setEntries(entriesOf(run));
    setWeight('');
    setTotal(String(weightOf(run)));
  };

  /** Banking a weighing moves the corrected total with it - they must agree. */
  const applyEntries = (next: number[]) => {
    setEntries(next);
    if (correcting) setTotal(String(sum(next)));
  };

  const addEntry = () => {
    const value = Number(weight);
    if (!weight.trim() || Number.isNaN(value) || value <= 0) {
      notify('Enter a weight above zero', 'warn');
      return;
    }
    applyEntries([...entries, value]);
    setWeight('');
    dismissPad();
  };

  /** Whatever is still in the add box - a crew that types one weight and saves. */
  const pendingEntry = () => {
    const value = Number(weight);
    return weight.trim() && !Number.isNaN(value) && value > 0 ? value : null;
  };

  const save = async () => {
    if (!target) return;
    // A single weighing does not need to be "added" first - take whatever is
    // still in the box so the crew is not caught out by an empty save.
    const extra = pendingEntry();
    const all = extra != null ? [...entries, extra] : entries;
    const onRecord = weightOf(target);
    const saved = correcting
      ? round2((Number(total) || 0) + (extra ?? 0))
      : sum(all);

    if (!saved) {
      notify(correcting ? 'Enter the corrected weight in kg' : 'Enter the weight in kg', 'warn');
      return;
    }
    if (correcting && saved === onRecord && sum(all) === sum(entriesOf(target))) {
      notify('Nothing changed on this run', 'warn');
      return;
    }

    const result = await dispatch(
      weighRun({ id: target.id, outWeight: saved, entries: all }),
    );
    const okay = weighRun.fulfilled.match(result);
    notify(
      okay
        ? correcting
          ? `Corrected to ${saved} kg`
          : `${saved} kg recorded`
        : correcting
          ? 'Could not save the correction'
          : 'Could not record the weight',
      okay ? 'ok' : 'err',
    );
    if (okay) setTarget(null);
  };

  const showAll = () => void dispatch(fetchWeighed({ all: !weighedAll }));

  if (loading && !pendingWeigh.length && !weighed.length) return <PageLoader label="Loading runs" />;

  if (!pendingWeigh.length && !weighed.length) {
    return (
      <>
        <ViewHead title="Weigh" />
        <EmptyState
          icon={icons.weigh}
          title="Nothing to weigh"
          hint="Finish a run on R4, a coarse R2 shift or a grinder shift and it lands here."
        />
      </>
    );
  }

  const onRecord = target ? weightOf(target) : 0;
  const corrected = round2((Number(total) || 0) + (pendingEntry() ?? 0));
  const diff = round2(corrected - onRecord);

  return (
    <>
      <ViewHead
        title="Weigh"
        meta={`${pendingWeigh.length} pending · ${weighedTotal} weighed`}
      />

      {pendingWeigh.length > 0 ? (
        <div className="stack">
          {pendingWeigh.map((run) => (
            <div key={run.id} className="wcard">
              <div className="info">
                <div className="row1">
                  <BatchRef>{run.batch_no ?? run.machine ?? run.machine_id}</BatchRef>
                  {run.quality ? (
                    <QualityChip quality={run.quality} />
                  ) : (
                    <span className="qchip shift">{run.shift}</span>
                  )}
                  {run.mesh && <FormChip style={{ color: 'var(--steel)' }}>{run.mesh}</FormChip>}
                </div>
                <small>
                  {run.machine ?? run.machine_id} · {dayMonth(run.shift_date)} ·{' '}
                  {duration(run.runtime_min, run.hours_run)}
                  {run.ended_at ? ` · ${clock(run.ended_at)}` : ''}
                </small>
              </div>
              <Button variant="primary" onClick={() => open(run)}>
                Weigh ▸
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={icons.weigh}
          title="Nothing to weigh"
          hint="Everything that has come off the machines is on the scale record below."
        />
      )}

      {weighed.length > 0 && (
        <>
          <div className="wsec">
            <div>
              <b>Weighed</b>{' '}
              <small>
                —{' '}
                {weighedAll || weighedTotal <= WEIGHED_PAGE
                  ? `all ${weighedTotal}`
                  : `latest ${weighed.length} of ${weighedTotal}`}
              </small>
            </div>
            {weighedTotal > weighed.length || weighedAll ? (
              <button type="button" onClick={showAll}>
                {weighedAll ? `Show latest ${WEIGHED_PAGE}` : `Show all ${weighedTotal}`}
              </button>
            ) : null}
          </div>

          <div className="stack">
            {weighed.map((run) => {
              const count = entriesOf(run).length;
              return (
                <div key={run.id} className="wcard">
                  <div className="info">
                    <div className="row1">
                      <BatchRef>{run.batch_no ?? run.machine ?? run.machine_id}</BatchRef>
                      {run.quality ? (
                        <QualityChip quality={run.quality} />
                      ) : (
                        <span className="qchip shift">{run.shift}</span>
                      )}
                      {run.mesh && <FormChip style={{ color: 'var(--steel)' }}>{run.mesh}</FormChip>}
                    </div>
                    <small>
                      <span style={{ color: 'var(--ok)' }}>{weightOf(run)} kg</span> ·{' '}
                      {sourceOf(run)}
                      {count > 0 ? ` · ${count} weighing${count > 1 ? 's' : ''}` : ''}
                    </small>
                  </div>
                  <Button onClick={() => openCorrection(run)}>Correct ▸</Button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <BottomSheet
        open={Boolean(target)}
        title={
          target
            ? `${correcting ? 'Correct' : 'Weigh'} ${target.batch_no ?? target.machine ?? target.machine_id}`
            : ''
        }
        subtitle={target ? subtitleOf(target) : undefined}
        led="var(--led-elec)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              {correcting ? 'Close' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={save}>
              {correcting ? 'Save correction' : 'Save weight'}
            </Button>
          </>
        }
      >
        {correcting && target && (
          <>
            <Readout label="Weight on record" value={`${onRecord} kg`} className="mb-2.5" />
            {entries.length > 0 && (
              <Readout
                label={`Weighings total${entries.length > 1 ? ` · ${entries.length}` : ''}`}
                value={`${entriesTotal} kg`}
                valueColor={entriesTotal === corrected ? undefined : 'var(--warn)'}
                className="mb-3"
              />
            )}
            <TextField
              label="Corrected total weight"
              inputMode="decimal"
              suffix="kg"
              placeholder={String(onRecord)}
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ''))}
              hint={
                diff === 0
                  ? `Unchanged — still ${onRecord} kg.`
                  : `${onRecord} kg → ${corrected} kg (${diff > 0 ? '+' : ''}${diff} kg).`
              }
            />
            {entries.length > 0 && entriesTotal !== corrected && (
              <div className="hint" style={{ color: 'var(--warn)' }}>
                The {entries.length} weighing{entries.length > 1 ? 's' : ''} below add up to{' '}
                {entriesTotal} kg. Both are kept — the corrected total is what goes on record.
              </div>
            )}
          </>
        )}

        {entries.length > 0 && (
          <div className="weighlist">
            {entries.map((value, i) => (
              <div key={`${value}-${i}`} className="weighrow">
                <span className="tnum">{value} kg</span>
                <button
                  type="button"
                  className="wdel"
                  aria-label={`Remove ${value} kg`}
                  onClick={() => applyEntries(entries.filter((_, index) => index !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field-inline items-stretch">
          <TextField
            label={correcting ? 'Add another weighing' : 'Weighing'}
            inputMode="decimal"
            suffix="kg"
            placeholder="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addEntry();
              }
            }}
            fieldClassName="flex-1 !mb-0"
          />
          <Button variant="elec" className="self-end" onClick={addEntry}>
            + Add
          </Button>
        </div>

        {!correcting && (
          <>
            <Readout label="Total" value={`${sum(entries)} kg`} className="mt-3" />
            <div className="hint">
              {target && entriesOf(target).length > 0
                ? 'Tallied while the machine ran — correct the list if needed, then save.'
                : 'Add each barrow as it comes off the scale, or type one weight and save.'}
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default WeighPage;
