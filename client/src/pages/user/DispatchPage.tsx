import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDispatches } from '@/features/dispatch/dispatchSlice';
import { Badge, Card, EmptyState, PageLoader } from '@/components/ui';
import { kg, rupees } from '@/utils/format';
import { dayMonth } from '@/utils/date';

/** Outward loads by customer and grade, priced from the rate card. */
export function DispatchPage() {
  const dispatch = useAppDispatch();
  const { items, loading } = useAppSelector((s) => s.dispatch);

  useEffect(() => {
    void dispatch(fetchDispatches(undefined));
  }, [dispatch]);

  if (loading && !items.length) return <PageLoader label="Loading dispatches" />;
  if (!items.length) return <EmptyState title="No dispatches yet" hint="Create one when a vehicle is loaded." />;

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((d) => (
        <Card key={d.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="block text-[15px] uppercase">{d.customer}</b>
              <small className="text-[11.5px] text-ink-faint">
                {d.grade} - {dayMonth(d.dispatch_date)} {d.vehicle ? `- ${d.vehicle}` : ''}
              </small>
            </div>
            <Badge tone={d.status === 'invoiced' ? 'ok' : d.status === 'dispatched' ? 'run' : 'neutral'}>
              {d.status}
            </Badge>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[12.5px]">
            <span className="tnum text-ink-dim">{kg(d.total_kg)}</span>
            <span className="tnum text-brand">{rupees(d.amount)}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default DispatchPage;
