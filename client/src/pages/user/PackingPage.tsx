import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchPendingPack, packRun } from '@/features/machines/runsSlice';
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
import { cn } from '@/utils/cn';
import { SACK_KG } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { dayMonth } from '@/utils/date';
import type { Run } from '@/types/models';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Weighed kg plus whatever the previous batch of this grade left behind. */
const totalFor = (run: Run) => round2((run.weight_kg ?? run.out_weight ?? 0) + (run.leftout_in ?? 0));
const sacksNeeded = (run: Run) => Math.max(0, Math.floor(totalFor(run) / SACK_KG));
const gradeOf = (run: Run) => run.quality ?? (run.line === 'coarse' ? 'Coarse' : 'Coarse');

/**
 * Bagging. Everything weighed goes out in 50 kg sacks, and the remainder
 * under one sack is not bagged - it is carried into the next batch of the
 * same grade. That carry is the whole reason this is its own step rather
 * than a number typed on the Weigh tab.
 */
export function PackingPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { pendingPack, loading } = useAppSelector((s) => s.runs);
  const [target, setTarget] = useState<Run | null>(null);
  const [sacks, setSacks] = useState('');
  const [grade, setGrade] = useState('');

  useEffect(() => {
    void dispatch(fetchPendingPack());
  }, [dispatch]);

  /*
   * The grades actually waiting, rather than every grade the plant makes. A
   * bagging line works one grade at a time and the crew wants the rest off the
   * screen, but offering a grade with nothing under it is a dead option on a
   * tablet - it is picked once, shows an empty list, and is never trusted again.
   */
  // How many runs are waiting under each grade - the number on its chip.
  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const run of pendingPack) tally[gradeOf(run)] = (tally[gradeOf(run)] ?? 0) + 1;
    return tally;
  }, [pendingPack]);

  // Widened to string: this is what the filter is set to, and it holds whatever
  // a chip carried rather than a member of the grade union.
  const grades = useMemo<string[]>(
    () => Object.keys(counts).sort((a, b) => a.localeCompare(b)),
    [counts],
  );

  const visible = useMemo(
    () => (grade ? pendingPack.filter((run) => gradeOf(run) === grade) : pendingPack),
    [pendingPack, grade],
  );

  /*
   * A grade that has just been bagged off the list stops being an option, and
   * leaving the picker on it would show an empty screen with no clue why. The
   * filter falls back to all rather than stranding the crew on a dead one.
   */
  useEffect(() => {
    if (grade && !grades.includes(grade)) setGrade('');
  }, [grade, grades]);

  const open = (run: Run) => {
    setTarget(run);
    setSacks(String(run.packed_sacks ?? sacksNeeded(run) ?? ''));
  };

  const leftOut = target ? round2(totalFor(target) - (Number(sacks) || 0) * SACK_KG) : 0;

  const save = async () => {
    if (!target) return;
    const count = Number(sacks);
    if (!sacks.trim() || Number.isNaN(count) || count < 0) {
      notify('Enter the sacks packed', 'warn');
      return;
    }
    if (leftOut < 0) {
      notify(`That is more than the ${totalFor(target)} kg available`, 'warn');
      return;
    }
    const result = await dispatch(
      packRun({ id: target.id, sacks: count, leftoutIn: target.leftout_in ?? 0, leftoutOut: leftOut }),
    );
    const okay = packRun.fulfilled.match(result);
    // Bagged sacks are stock from here on: they show up on the Dispatch tab as
    // ready to load, so the toast says where they went.
    notify(
      okay
        ? `${count} sacks packed → Dispatch · ${leftOut} kg carried forward`
        : 'Could not record the packing',
      okay ? 'ok' : 'err',
    );
    if (okay) setTarget(null);
  };

  if (loading && !pendingPack.length) return <PageLoader label="Loading runs" />;

  if (!pendingPack.length) {
    return (
      <>
        <ViewHead title="Packing" />
        <EmptyState
          icon={icons.packing}
          title="Nothing to pack"
          hint="Weigh a quality on R4 or a coarse shift and it lands here to be bagged."
        />
      </>
    );
  }

  return (
    <>
      <ViewHead
        title="Packing"
        meta={
          grade ? `${visible.length} of ${pendingPack.length} to pack` : `${pendingPack.length} to pack`
        }
      />

      {/* One grade waiting is not something to filter, so the row only appears
          once there is a choice to make. */}
      {grades.length > 1 && (
        <div className="gradebar" role="group" aria-label="Filter by quality">
          <button
            type="button"
            className={cn('gradebtn all-grades', !grade && 'on')}
            aria-pressed={!grade}
            onClick={() => setGrade('')}
          >
            All <span className="n">{pendingPack.length}</span>
          </button>
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              // The selected fill is the grade's own colour, off the same
              // `.q-<Grade>` class its chip wears on the cards below.
              className={cn('gradebtn', grade === g && `on q-${g}`)}
              aria-pressed={grade === g}
              onClick={() => setGrade(g)}
            >
              {g} <span className="n">{counts[g]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="stack">
        {visible.map((run) => {
          const packed = run.packed_sacks ?? 0;
          const total = totalFor(run);
          return (
            <div key={run.id} className="wcard">
              <div className="info">
                <div className="row1">
                  <BatchRef>{run.batch_no ?? dayMonth(run.shift_date)}</BatchRef>
                  <QualityChip quality={gradeOf(run)} />
                  {run.formulation && <FormChip>{run.formulation}</FormChip>}
                </div>
                {packed > 0 ? (
                  <small style={{ color: 'var(--elec)' }}>
                    {packed} sacks packed · {round2(total - packed * SACK_KG)} kg left
                  </small>
                ) : (
                  <small>
                    weighed {run.weight_kg ?? run.out_weight ?? 0} kg
                    {run.leftout_in ? ` + ${run.leftout_in} carried = ${total} kg` : ''} · ≈{' '}
                    {sacksNeeded(run)} sacks
                  </small>
                )}
              </div>
              <Button variant="primary" onClick={() => open(run)}>
                {packed > 0 ? 'Update ▸' : 'Pack ▸'}
              </Button>
            </div>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(target)}
        title={target ? `Pack ${target.batch_no ?? dayMonth(target.shift_date)} · ${gradeOf(target)}` : ''}
        subtitle={
          target
            ? `Weighed ${target.weight_kg ?? target.out_weight ?? 0} kg${
                target.leftout_in ? ` + ${target.leftout_in} kg carried = ${totalFor(target)} kg` : ''
              } · ${SACK_KG} kg per sack.`
            : undefined
        }
        led="var(--led-elec)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Pack &amp; carry forward
            </Button>
          </>
        }
      >
        {target && (
          <>
            {(target.leftout_in ?? 0) > 0 && (
              <Readout
                label="Carried in from last batch"
                value={`+${target.leftout_in} kg`}
                valueColor="var(--elec)"
                className="mb-2.5"
              />
            )}
            <Readout
              label="Full sacks"
              value={`${sacksNeeded(target)} sacks · ${sacksNeeded(target) * SACK_KG} kg`}
              className="mb-2.5"
            />
            <Readout
              label={`Left out → next ${gradeOf(target)} batch`}
              value={`${leftOut} kg`}
              valueColor={leftOut < 0 ? 'var(--err)' : 'var(--amber)'}
              className="mb-3.5"
            />
            <TextField
              label="Sacks packed"
              type="number"
              inputMode="numeric"
              placeholder={String(sacksNeeded(target))}
              value={sacks}
              onChange={(e) => setSacks(e.target.value.replace(/[^\d]/g, ''))}
            />
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default PackingPage;
