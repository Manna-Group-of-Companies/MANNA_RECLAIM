import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchPendingWeigh, weighRun } from '@/features/machines/runsSlice';
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
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { duration } from '@/utils/format';
import { clock, dayMonth } from '@/utils/date';
import type { Run } from '@/types/models';

/**
 * The weigh queue: runs that finished on a machine whose output is weighed
 * (the grinders, R2, R4) and that nobody has put on the scale yet.
 *
 * Material comes off in more than one barrow, so the sheet keeps a running
 * list of individual weighings and sends their total once. Until it is sent
 * the run stays here, which is what makes the tab badge trustworthy.
 */
export function WeighPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { pendingWeigh, loading } = useAppSelector((s) => s.runs);
  const [target, setTarget] = useState<Run | null>(null);
  const [entries, setEntries] = useState<number[]>([]);
  const [weight, setWeight] = useState('');

  useEffect(() => {
    void dispatch(fetchPendingWeigh());
  }, [dispatch]);

  const total = Math.round(entries.reduce((sum, n) => sum + n, 0) * 100) / 100;

  const open = (run: Run) => {
    setTarget(run);
    setEntries([]);
    setWeight('');
  };

  const addEntry = () => {
    const value = Number(weight);
    if (!weight.trim() || Number.isNaN(value) || value <= 0) {
      notify('Enter a weight above zero', 'warn');
      return;
    }
    setEntries([...entries, value]);
    setWeight('');
  };

  const save = async () => {
    if (!target) return;
    // A single weighing does not need to be "added" first - take whatever is
    // still in the box so the crew is not caught out by an empty save.
    const pending = Number(weight);
    const all = weight.trim() && !Number.isNaN(pending) && pending > 0 ? [...entries, pending] : entries;
    const sum = Math.round(all.reduce((s, n) => s + n, 0) * 100) / 100;
    if (!sum) {
      notify('Enter the weight in kg', 'warn');
      return;
    }
    const result = await dispatch(weighRun({ id: target.id, outWeight: sum }));
    const okay = weighRun.fulfilled.match(result);
    notify(okay ? `${sum} kg recorded` : 'Could not record the weight', okay ? 'ok' : 'err');
    if (okay) setTarget(null);
  };

  if (loading && !pendingWeigh.length) return <PageLoader label="Loading runs" />;

  if (!pendingWeigh.length) {
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

  return (
    <>
      <ViewHead title="Weigh" meta={`${pendingWeigh.length} pending`} />

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

      <BottomSheet
        open={Boolean(target)}
        title={target ? `Weigh ${target.batch_no ?? target.machine ?? target.machine_id}` : ''}
        subtitle={
          target
            ? `${target.machine ?? target.machine_id} · ${dayMonth(target.shift_date)} ${target.shift}`
            : undefined
        }
        led="var(--elec)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save weight
            </Button>
          </>
        }
      >
        {entries.length > 0 && (
          <div className="weighlist">
            {entries.map((value, i) => (
              <div key={`${value}-${i}`} className="weighrow">
                <span className="tnum">{value} kg</span>
                <button
                  type="button"
                  className="wdel"
                  aria-label={`Remove ${value} kg`}
                  onClick={() => setEntries(entries.filter((_, index) => index !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field-inline items-stretch">
          <TextField
            label="Weighing"
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

        <Readout label="Total" value={`${total} kg`} className="mt-3" />
        <div className="hint">
          Add each barrow as it comes off the scale, or type one weight and save.
        </div>
      </BottomSheet>
    </>
  );
}

export default WeighPage;
