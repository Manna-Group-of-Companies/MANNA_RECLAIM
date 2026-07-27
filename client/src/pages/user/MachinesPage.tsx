import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import { fetchActiveRuns, startRun, stopRun } from '@/features/machines/runsSlice';
import { MachineCard } from '@/features/machines/MachineCard';
import { BottomSheet, Button, EmptyState, PageLoader } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { QUALITIES } from '@/config/constants';
import type { Machine, Quality, Run } from '@/types/models';

/** Landing tab: every machine grouped by line, with start / stop actions. */
export function MachinesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { groups, loading } = useAppSelector((s) => s.machines);
  const active = useAppSelector((s) => s.runs.active);

  const [starting, setStarting] = useState<Machine | null>(null);
  const [quality, setQuality] = useState<Quality>('Special');

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchActiveRuns());
  }, [dispatch]);

  const runByMachine = useMemo(
    () => new Map(active.map((r) => [r.machine_id, r])),
    [active],
  );

  const confirmStart = async () => {
    if (!starting) return;
    const needsQuality = starting.needs_quality ?? false;
    const result = await dispatch(
      startRun({ machineId: starting.id, quality: needsQuality ? quality : null }),
    );
    notify(
      startRun.fulfilled.match(result) ? `${starting.name} started` : 'Could not start the run',
      startRun.fulfilled.match(result) ? 'ok' : 'err',
    );
    setStarting(null);
  };

  const onStop = async (run: Run) => {
    const result = await dispatch(stopRun({ id: run.id }));
    notify(stopRun.fulfilled.match(result) ? 'Run stopped' : 'Could not stop the run', stopRun.fulfilled.match(result) ? 'ok' : 'err');
  };

  if (loading && !Object.keys(groups).length) return <PageLoader label="Loading machines" />;

  if (!Object.keys(groups).length) {
    return <EmptyState title="No machines configured" hint="Add machines from the admin side to see them here." />;
  }

  return (
    <>
      <div className="space-y-5">
        {Object.entries(groups).map(([group, machines]) => (
          <section key={group}>
            <div className="mb-2.5 flex items-center gap-3 px-1">
              <b className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">{group}</b>
              <span className="h-px flex-1 bg-line" />
              <span className="tnum text-[10px] text-brand">
                {machines.filter((m) => runByMachine.has(m.id)).length}/{machines.length}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {machines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  run={runByMachine.get(machine.id)}
                  onStart={setStarting}
                  onStop={onStop}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <BottomSheet
        open={Boolean(starting)}
        title={starting?.name ?? ''}
        subtitle="Start a run on this machine"
        onClose={() => setStarting(null)}
        footer={
          <>
            <Button className="flex-1" onClick={() => setStarting(null)}>
              Cancel
            </Button>
            <Button className="flex-1" variant="primary" onClick={confirmStart}>
              Start run
            </Button>
          </>
        }
      >
        {starting?.needs_quality && (
          <div>
            <span className="label-caps">Quality</span>
            <div className="grid grid-cols-2 gap-2">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`rounded-field border px-3 py-3 text-left text-[15px] font-bold ${
                    quality === q ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong bg-panel-field'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

export default MachinesPage;
