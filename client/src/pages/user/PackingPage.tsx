import { useEffect, useState } from 'react';
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

  useEffect(() => {
    void dispatch(fetchPendingPack());
  }, [dispatch]);

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
    notify(
      okay ? `${count} sacks packed · ${leftOut} kg carried forward` : 'Could not record the packing',
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
      <ViewHead title="Packing" meta={`${pendingPack.length} to pack`} />

      <div className="stack">
        {pendingPack.map((run) => {
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
