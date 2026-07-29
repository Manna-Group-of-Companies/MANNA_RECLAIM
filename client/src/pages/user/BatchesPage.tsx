import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { closeBatch, fetchOpenBatches } from '@/features/batches/batchesSlice';
import { fetchShiftRuns } from '@/features/machines/runsSlice';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FormChip,
  PageLoader,
  ViewHead,
} from '@/components/ui';
import { QUALITIES, SACK_KG } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import type { Batch, Quality, Run } from '@/types/models';

/**
 * One row of the stage grid per quality: was it taken off this batch, has it
 * been through the refiners, and has it been weighed. It reads off the runs
 * logged against the batch number, so nothing extra has to be recorded.
 */
interface Stages {
  taken: boolean;
  refined: boolean;
  finished: boolean;
  weighed: boolean;
}

const REFINER_STAGE = ['R3', 'R1', 'PR2'];
const FINISH_STAGE = ['R4'];

function stagesFor(batch: Batch, runs: Run[]): Record<Quality, Stages> {
  const mine = runs.filter((r) => (r.batch_no ?? r.batch_id) === batch.ref);
  const taken = new Set<string>(batch.qualities ?? (batch.grade ? [batch.grade] : []));
  const on = (ids: string[], q: Quality) => mine.some((r) => ids.includes(r.machine_id) && r.quality === q);
  return Object.fromEntries(
    QUALITIES.map((q) => [
      q,
      {
        // A quality counts as taken once the batch says so, or once a refiner
        // has actually run it - whichever the crew got to first.
        taken: taken.has(q) || on([...REFINER_STAGE, ...FINISH_STAGE], q),
        refined: on(REFINER_STAGE, q),
        finished: on(FINISH_STAGE, q),
        weighed: mine.some((r) => r.quality === q && (r.weight_kg ?? r.out_weight ?? 0) > 0),
      },
    ]),
  ) as Record<Quality, Stages>;
}

/** Open autoclave loads, each with the qualities taken off it so far. */
export function BatchesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { items, loading } = useAppSelector((s) => s.batches);
  const runs = useAppSelector((s) => s.runs.shift);
  const held = useAppSelector((s) => s.quality.held);
  const [closing, setClosing] = useState<Batch | null>(null);

  useEffect(() => {
    void dispatch(fetchOpenBatches());
    void dispatch(fetchShiftRuns(undefined));
  }, [dispatch]);

  const stageMap = useMemo(() => new Map(items.map((b) => [b.id, stagesFor(b, runs)])), [items, runs]);

  const confirmClose = async () => {
    if (!closing) return;
    const result = await dispatch(closeBatch({ id: closing.id }));
    const okay = closeBatch.fulfilled.match(result);
    notify(okay ? `Batch ${closing.ref} closed` : 'Could not close the batch', okay ? 'ok' : 'err');
    if (okay) setClosing(null);
  };

  if (loading && !items.length) return <PageLoader label="Loading batches" />;

  if (!items.length) {
    return (
      <>
        <ViewHead title="Batches" />
        <EmptyState
          icon={icons.batches}
          title="No active batches"
          hint="Load an autoclave on the Machines tab to start one. Finished batches drop off here automatically."
        />
      </>
    );
  }

  return (
    <>
      <ViewHead title="Batches" meta={`${items.length} active`} />

      <div className="stack">
        {items.map((batch) => {
          const stages = stageMap.get(batch.id);
          const taken = QUALITIES.filter((q) => stages?.[q].taken);
          const weighed = taken.filter((q) => stages?.[q].weighed);
          const ready = taken.length > 0 && weighed.length === taken.length;
          const onHold = held.includes(batch.ref);

          return (
            <div key={batch.id} className="bcard">
              <div className="bhead">
                <div className="l">
                  <BatchRef className="text-base">{batch.ref}</BatchRef>
                  {batch.machine_id && (
                    <FormChip style={{ color: 'var(--ember)' }}>{batch.machine_id}</FormChip>
                  )}
                  {batch.formulation && <FormChip>{batch.formulation}</FormChip>}
                  {onHold && <span className="qchip hold">QC hold</span>}
                </div>
                <span className={cn('bstate', ready ? 'ready' : 'cook')}>
                  {taken.length
                    ? `${weighed.length}/${taken.length} weighed`
                    : batch.autoclave_done
                      ? 'mark qualities'
                      : 'In autoclave'}
                </span>
              </div>

              <div className="qgrid">
                <div className="hdr" style={{ textAlign: 'left' }}>
                  Taken?
                </div>
                <div className="hdr">R3/R1</div>
                <div className="hdr">R4</div>
                <div className="hdr">Weighed</div>

                {QUALITIES.map((q) => {
                  const s = stages?.[q];
                  return (
                    <div key={q} className="contents">
                      <div className={cn('qlabel qtake', s?.taken ? 'on' : 'off')}>
                        <span className="qbox">{s?.taken ? '✓' : ''}</span>
                        <span className="qdot" style={{ background: `var(--q-${q.toLowerCase()})` }} />
                        {q}
                      </div>
                      <div className={cn('stagedot', s?.taken && s?.refined && 'done')}>
                        {s?.refined ? '✓' : '·'}
                      </div>
                      <div className={cn('stagedot', s?.taken && s?.finished && 'done')}>
                        {s?.finished ? '✓' : '·'}
                      </div>
                      <div className={cn('stagedot', s?.taken && s?.weighed && 'weighed')}>
                        {s?.weighed ? '✓' : '·'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bhint">
                A quality is marked taken by running it against this batch number. Weigh each one,
                then close the batch to file it away.
              </div>

              <Button
                variant={ready ? 'primary' : 'ghost'}
                className="bclose"
                onClick={() => setClosing(batch)}
              >
                {ready
                  ? 'Close batch ▸'
                  : taken.length
                    ? `${weighed.length}/${taken.length} weighed`
                    : 'Mark qualities to close'}
              </Button>
            </div>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(closing)}
        title={closing ? `Close batch ${closing.ref}?` : ''}
        subtitle="It drops off this tab and stops taking new runs. The admin side can reopen it."
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
            {closing.formulation ?? 'No formulation recorded'} · {closing.capacity ?? '--'} kg charge ·{' '}
            {closing.packed_sacks ?? 0} sacks packed ({SACK_KG} kg each).
          </div>
        )}
      </BottomSheet>
    </>
  );
}

export default BatchesPage;
