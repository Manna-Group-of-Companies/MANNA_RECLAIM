import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchActiveRuns, stopRun } from '@/features/machines/runsSlice';
import { BottomSheet, Button, Card, EmptyState, PageLoader } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { kg } from '@/utils/format';
import type { Run } from '@/types/models';

/** Records the out-weight for runs on machines that are weighed at stop. */
export function WeighPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { active, loading } = useAppSelector((s) => s.runs);
  const [target, setTarget] = useState<Run | null>(null);
  const [weight, setWeight] = useState('');

  useEffect(() => {
    void dispatch(fetchActiveRuns());
  }, [dispatch]);

  const save = async () => {
    if (!target) return;
    const result = await dispatch(stopRun({ id: target.id, outWeight: Number(weight) || 0 }));
    notify(stopRun.fulfilled.match(result) ? 'Weight recorded' : 'Could not record the weight', stopRun.fulfilled.match(result) ? 'ok' : 'err');
    setTarget(null);
    setWeight('');
  };

  if (loading && !active.length) return <PageLoader label="Loading runs" />;
  if (!active.length) return <EmptyState title="Nothing to weigh" hint="Runs appear here once a machine is started." />;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {active.map((run) => (
          <Card key={run.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-[15px]">{run.machine_id}</b>
                <small className="tnum text-[11.5px] text-ink-faint">
                  {run.shift_date} - {run.shift} - {kg(run.out_weight)}
                </small>
              </div>
              <Button variant="elec" size="sm" onClick={() => setTarget(run)}>
                Weigh
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <BottomSheet
        open={Boolean(target)}
        title="Record out-weight"
        subtitle={target?.machine_id}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button className="flex-1" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button className="flex-1" variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <label className="label-caps" htmlFor="weight">Weight (kg)</label>
        <input
          id="weight"
          className="field-input tnum"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
        />
      </BottomSheet>
    </>
  );
}

export default WeighPage;
