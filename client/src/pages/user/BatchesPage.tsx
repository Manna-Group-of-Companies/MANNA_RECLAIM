import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  clearBatchDetail,
  closeBatch,
  deleteBatch,
  fetchBatchDetail,
  fetchOpenBatches,
  setBatchQuality,
} from '@/features/batches/batchesSlice';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FormChip,
  PageLoader,
  QualityChip,
  Readout,
  SheetLabel,
  Spinner,
  ViewHead,
} from '@/components/ui';
import { BATCH_QUALITIES, SACK_KG } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import { clock24, dayMonth } from '@/utils/date';
import { duration, kg, num } from '@/utils/format';
import type { Batch, BatchDetail, BatchGrade, Quality } from '@/types/models';

/**
 * The batch list: every open autoclave charge, and where each grade taken off it
 * has got to.
 *
 * Nothing on this screen is computed from runs here - the API works the grid,
 * the state chip and the orphan flag out from the runs logged against the batch
 * number and sends them down with the batch. The card's job is to show that and
 * to offer the three decisions the floor actually makes: which grades the charge
 * will yield, when it can be closed, and whether a batch with nothing against it
 * should be deleted.
 */

const blank: BatchGrade = {
  quality: 'Special',
  marked: false,
  refined: false,
  finished: false,
  weighed: false,
  kg: null,
};

/**
 * The grid row for a grade. Only ever asked for a grade this batch is tracked
 * in - DRC has no row here, and the API leaves it out of `grades` for the same
 * reason.
 */
const gradeRow = (batch: Batch, quality: Quality): BatchGrade =>
  batch.grades?.find((g) => g.quality === quality) ?? { ...blank, quality };

/**
 * The rows this batch's grid has, read off the API's answer rather than off
 * BATCH_QUALITIES.
 *
 * Which grades a charge is tracked in is not the same question for every
 * charge - a Special DRC one comes off as Special DRC or Special and as nothing
 * else - and the server already worked it out to build `grades`. Deciding it
 * again here is how the card ends up offering a row the API will refuse.
 * BATCH_QUALITIES stands in only for a batch that arrived without the field.
 */
const gridRows = (batch: Batch): Quality[] =>
  batch.grades?.length ? batch.grades.map((g) => g.quality) : BATCH_QUALITIES;

/** Which way the state chip is tinted: cooking, waiting on a tick, or done. */
function chipTone(batch: Batch) {
  const marked = batch.marked_count ?? 0;
  if (marked > 0 && (batch.weighed_count ?? 0) === marked) return 'ready';
  if (batch.autoclave_done && marked === 0) return 'mark';
  return 'cook';
}

/**
 * Why a grade cannot be un-ticked. A grade a refiner has already run is a
 * statement about work that happened, so the card says where to correct it
 * rather than letting the tick contradict the runs.
 */
const lockedReason = (row: BatchGrade) =>
  row.marked && (row.refined || row.finished || row.weighed)
    ? `${row.quality} has already been run off this batch — correct those runs in History to unmark it`
    : null;

export function BatchesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { items, loading, detail, detailLoading } = useAppSelector((s) => s.batches);
  const held = useAppSelector((s) => s.quality.held);
  const [closing, setClosing] = useState<Batch | null>(null);
  const [deleting, setDeleting] = useState<Batch | null>(null);
  /** The grade whose toggle is in flight, so its box cannot be double-tapped. */
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchOpenBatches());
  }, [dispatch]);

  const toggle = async (batch: Batch, row: BatchGrade) => {
    const locked = lockedReason(row);
    if (locked) {
      notify(locked, 'warn');
      return;
    }
    if (!batch.autoclave_done) {
      notify(`Batch ${batch.ref} is still in the autoclave — unload it first`, 'warn');
      return;
    }
    const key = `${batch.id}:${row.quality}`;
    setPending(key);
    const result = await dispatch(
      setBatchQuality({ id: batch.id, quality: row.quality, marked: !row.marked }),
    );
    setPending(null);
    if (setBatchQuality.rejected.match(result)) {
      notify((result.payload as string) ?? 'Could not change the grade', 'err');
    }
  };

  const confirmClose = async () => {
    if (!closing) return;
    const result = await dispatch(closeBatch({ id: closing.id }));
    if (closeBatch.fulfilled.match(result)) {
      notify(`Batch ${closing.ref} closed`, 'ok');
      setClosing(null);
      return;
    }
    // The server owns the rule, so its count of what is outstanding is what the
    // crew is shown - the sheet stays open on it rather than closing on a guess.
    notify((result.payload as string) ?? 'Could not close the batch', 'err');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await dispatch(deleteBatch(deleting.id));
    if (deleteBatch.fulfilled.match(result)) {
      const { qualityTests } = result.payload;
      notify(
        `Batch ${deleting.ref} deleted${qualityTests ? ` · ${qualityTests} quality test(s) removed` : ''}`,
        'ok',
      );
      setDeleting(null);
      return;
    }
    notify((result.payload as string) ?? 'Could not delete the batch', 'err');
  };

  const openDetail = (batch: Batch) => {
    dispatch(clearBatchDetail());
    void dispatch(fetchBatchDetail(batch.id));
  };

  if (loading && !items.length) return <PageLoader label="Loading batches" />;

  if (!items.length) {
    return (
      <>
        <ViewHead title="Batches" />
        <EmptyState
          icon={icons.batches}
          title="No active batches"
          hint="Charge an autoclave with a special formulation on the Machines tab to start one — coarse and DRC loads are counted by their runs instead. Closed batches drop off here automatically and stay on the dispatch and history record."
        />
      </>
    );
  }

  return (
    <>
      <ViewHead title="Batches" meta={`${items.length} active`} />

      <div className="stack">
        {items.map((batch) => {
          const marked = batch.marked_count ?? 0;
          const weighed = batch.weighed_count ?? 0;
          const ready = marked > 0 && weighed === marked;
          const outstanding = marked - weighed;

          return (
            <div key={batch.id} className={cn('bcard', batch.orphaned && 'orphan')}>
              <div className="bhead">
                <div className="l">
                  <BatchRef className="text-base">{batch.ref}</BatchRef>
                  {batch.machine_id && (
                    <FormChip style={{ color: 'var(--ember)' }}>{batch.machine_id}</FormChip>
                  )}
                  {batch.formulation && <FormChip>{batch.formulation}</FormChip>}
                  {held.includes(batch.ref) && <span className="qchip hold">QC hold</span>}
                </div>
                <span className={cn('bstate', chipTone(batch))}>{batch.state_label}</span>
              </div>

              {/* The pre-refiners are not a per-grade stage: they break the whole
                  charge down before the grades are split out of it. */}
              <div className="bmeta">
                <span className="k">Pre-refiners</span>
                {batch.pre_refiners?.length ? (
                  batch.pre_refiners.map((id) => <FormChip key={id}>{id}</FormChip>)
                ) : (
                  <span className="muted">none yet</span>
                )}
              </div>

              <div className="qgrid">
                <div className="hdr" style={{ textAlign: 'left' }}>
                  Yields?
                </div>
                <div className="hdr">R3/R1</div>
                <div className="hdr">R4</div>
                <div className="hdr">Weighed</div>

                {gridRows(batch).map((quality) => {
                  const row = gradeRow(batch, quality);
                  const key = `${batch.id}:${quality}`;
                  const locked = Boolean(lockedReason(row));
                  return (
                    <div key={quality} className="contents">
                      <button
                        type="button"
                        aria-pressed={row.marked}
                        aria-label={`${quality} — ${row.marked ? 'yielded by' : 'not yielded by'} batch ${batch.ref}`}
                        className={cn('qtake', row.marked ? 'on' : 'off', locked && 'locked')}
                        disabled={pending === key}
                        onClick={() => void toggle(batch, row)}
                      >
                        <span className="qbox">{row.marked ? '✓' : ''}</span>
                        <span
                          className="qdot"
                          style={{ background: `var(--q-${quality.toLowerCase()})` }}
                        />
                        {quality}
                      </button>
                      <div className={cn('stagedot', row.marked && row.refined && 'done')}>
                        {row.refined ? '✓' : '·'}
                      </div>
                      <div className={cn('stagedot', row.marked && row.finished && 'done')}>
                        {row.finished ? '✓' : '·'}
                      </div>
                      <div className={cn('stagedot', row.marked && row.weighed && 'weighed')}>
                        {row.weighed ? '✓' : '·'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {batch.orphaned ? (
                <div className="borphan">
                  <b>Orphaned.</b> Nothing has ever been logged against this batch and it is in no
                  autoclave — its load was most likely cancelled after the batch had been opened.
                  It can be deleted, along with any quality tests filed against its number.
                </div>
              ) : (
                <div className="bhint">
                  {!batch.autoclave_done
                    ? 'Unload the autoclave on the Machines tab to release this batch to the refiners.'
                    : marked === 0
                      ? 'Tick the grades this charge will yield. Logging a run on R4 ticks one for you.'
                      : `Weigh each marked grade, then close the batch to file it away.${
                          outstanding > 0 ? ` ${outstanding} still to weigh.` : ''
                        }`}
                </div>
              )}

              <div className="bactions">
                <Button variant="ghost" onClick={() => openDetail(batch)}>
                  Details
                </Button>
                {batch.orphaned ? (
                  <Button variant="danger" onClick={() => setDeleting(batch)}>
                    Delete batch
                  </Button>
                ) : (
                  <Button variant={ready ? 'primary' : 'ghost'} onClick={() => setClosing(batch)}>
                    {ready
                      ? 'Close batch ▸'
                      : marked
                        ? `${weighed}/${marked} weighed`
                        : 'Mark grades to close'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- close a batch ---- */}
      <BottomSheet
        open={Boolean(closing)}
        title={closing ? `Close batch ${closing.ref}?` : ''}
        subtitle="It drops off this tab and stops taking new runs, and stays on the dispatch and history record. The admin side can reopen it."
        onClose={() => setClosing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Keep open
            </Button>
            <Button variant="primary" onClick={confirmClose}>
              Close batch
            </Button>
          </>
        }
      >
        {closing && (
          <div className="hint">
            {closing.formulation ?? 'No formulation recorded'} · {closing.capacity ?? '--'} kg charge
            · {closing.packed_sacks ?? 0} sacks packed ({SACK_KG} kg each).
          </div>
        )}
      </BottomSheet>

      {/* ---- delete an orphan ---- */}
      <BottomSheet
        open={Boolean(deleting)}
        title={deleting ? `Delete batch ${deleting.ref}?` : ''}
        subtitle="Only an orphaned batch can be deleted. Its quality tests go with it, and this cannot be undone."
        led="var(--led-err)"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Yes, delete
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="hint">
            {deleting.machine_id ?? 'No autoclave'} · {deleting.formulation ?? 'no formulation'} ·
            opened {dayMonth(deleting.opened_at)}. No run has ever been logged against this number.
          </div>
        )}
      </BottomSheet>

      <BatchDetailSheet
        batch={detail}
        loading={detailLoading}
        onClose={() => dispatch(clearBatchDetail())}
      />
    </>
  );
}

/** "shared with the twin vessel · 1 worker" - who charged the autoclave. */
function crewOf(batch: BatchDetail) {
  const shared = batch.paired ? 'crew shared with the twin vessel' : 'charged alone';
  const hands = batch.workers != null ? `${batch.workers} worker${batch.workers === 1 ? '' : 's'}` : null;
  return [shared, hands].filter(Boolean).join(' · ');
}

/**
 * The whole record of one batch: what went in, who put it there, what came out
 * of each grade, what was moved between grades, the yield those two make, and
 * every run logged against the number.
 */
function BatchDetailSheet({
  batch,
  loading,
  onClose,
}: {
  batch: BatchDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const yielded = batch?.grades?.filter((g) => g.marked || g.kg != null) ?? [];

  return (
    <BottomSheet
      open={loading || Boolean(batch)}
      title={batch ? `Batch ${batch.ref}` : 'Batch'}
      subtitle={
        batch
          ? [batch.machine_id, batch.formulation, batch.state_label].filter(Boolean).join(' · ')
          : undefined
      }
      led="var(--led-brand)"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {!batch ? (
        <div className="hint flex items-center gap-2">
          <Spinner /> Loading the batch record…
        </div>
      ) : (
        <>
          <SheetLabel>Charge</SheetLabel>
          <Readout label="Charged with" value={kg(batch.capacity)} />
          <Readout label="Crew" value={crewOf(batch)} />
          <Readout
            label="Shift"
            value={[batch.shift, dayMonth(batch.shift_date)].filter(Boolean).join(' · ') || '--'}
          />
          <Readout label="Signed by" value={batch.opened_by ?? '--'} />

          <SheetLabel className="mt-4">In the autoclave</SheetLabel>
          <Readout
            label="Loaded"
            value={
              batch.loaded_at ? `${dayMonth(batch.loaded_at)} ${clock24(batch.loaded_at)}` : '--'
            }
          />
          <Readout
            label="Unloaded"
            value={
              batch.unloaded_at
                ? `${dayMonth(batch.unloaded_at)} ${clock24(batch.unloaded_at)}`
                : 'still in the vessel'
            }
          />

          <SheetLabel className="mt-4">Per grade</SheetLabel>
          {yielded.length ? (
            yielded.map((row) => (
              <Readout
                key={row.quality}
                label={<QualityChip quality={row.quality} />}
                value={row.kg != null ? kg(row.kg) : 'not weighed'}
                valueColor={row.kg == null ? 'var(--amber)' : undefined}
              />
            ))
          ) : (
            <div className="hint">No grades marked on this batch yet.</div>
          )}

          {/* Output over what went in. Shown as the division it is, so the figure
              can be checked against the two lines above it rather than trusted. */}
          <SheetLabel className="mt-4">Yield</SheetLabel>
          <Readout label="Weighed out" value={kg(batch.weighed_kg)} />
          <Readout
            label="Yield"
            value={
              batch.yield_pct != null
                ? `${kg(batch.weighed_kg)} ÷ ${kg(batch.capacity)} = ${num(batch.yield_pct)}%`
                : '--'
            }
            valueColor={batch.yield_pct != null ? 'var(--ok)' : undefined}
          />

          <SheetLabel className="mt-4">Conversions</SheetLabel>
          {batch.conversions?.length ? (
            batch.conversions.map((c) => (
              <Readout
                key={c.id}
                label={`${c.from_quality ?? '?'} → ${c.to_quality ?? '?'}${c.stage ? ` · ${c.stage}` : ''}`}
                value={kg(c.qty_kg)}
              />
            ))
          ) : (
            <div className="hint">Nothing was moved between grades on this batch.</div>
          )}

          <SheetLabel className="mt-4">
            Runs
            <span className="muted normal-case tracking-normal"> — {batch.runs?.length ?? 0} logged</span>
          </SheetLabel>
          {batch.runs?.length ? (
            <div className="bruns">
              {batch.runs.map((run) => (
                <div key={run.id} className="brun">
                  <div className="l">
                    <b>{run.machine ?? run.machine_id}</b>
                    {run.quality && <QualityChip quality={run.quality} />}
                    {run.non_production && <FormChip>non-production</FormChip>}
                  </div>
                  <div className="r">
                    <span className="muted">
                      {dayMonth(run.shift_date)} {run.shift}
                    </span>
                    <span>{run.ended_at ? duration(run.runtime_min, run.hours_run) : 'running'}</span>
                    <b>{kg(run.weight_kg ?? run.out_weight)}</b>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="hint">Nothing has been logged against this batch number.</div>
          )}
        </>
      )}
    </BottomSheet>
  );
}

export default BatchesPage;
