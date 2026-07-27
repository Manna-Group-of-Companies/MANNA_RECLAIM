import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { closeBatch, fetchOpenBatches } from '@/features/batches/batchesSlice';
import { Badge, Button, Card, EmptyState, PageLoader, QualityChip } from '@/components/ui';
import { clock } from '@/utils/date';
import { useToast } from '@/hooks/useToast';

/** Open autoclave / refiner batches with their stage progress. */
export function BatchesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { items, loading } = useAppSelector((s) => s.batches);

  useEffect(() => {
    void dispatch(fetchOpenBatches());
  }, [dispatch]);

  if (loading && !items.length) return <PageLoader label="Loading batches" />;
  if (!items.length) return <EmptyState title="No open batches" hint="A batch opens when an autoclave load is charged." />;

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((batch) => (
        <Card key={batch.id}>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="tnum text-[13px] font-semibold">{batch.ref}</span>
              {batch.grade && <QualityChip quality={batch.grade} />}
            </div>
            <Badge tone={batch.status === 'open' ? 'warn' : 'ok'}>{batch.status}</Badge>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-[11.5px] text-ink-faint">
            <div>
              <dt className="uppercase tracking-wider">Machine</dt>
              <dd className="text-ink">{batch.machine_id}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider">Capacity</dt>
              <dd className="tnum text-ink">{batch.capacity ?? '--'}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider">Opened</dt>
              <dd className="tnum text-ink">{clock(batch.opened_at)}</dd>
            </div>
          </dl>

          <Button
            size="lg"
            className="mt-3"
            onClick={async () => {
              const result = await dispatch(closeBatch({ id: batch.id }));
              notify(closeBatch.fulfilled.match(result) ? 'Batch closed' : 'Could not close the batch', closeBatch.fulfilled.match(result) ? 'ok' : 'err');
            }}
          >
            Close batch
          </Button>
        </Card>
      ))}
    </div>
  );
}

export default BatchesPage;
