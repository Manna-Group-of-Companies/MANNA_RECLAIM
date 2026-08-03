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

/** A press run is boxed by the piece; everything else is bagged by weight. */
const isPress = (run: Run) => run.kind === 'press';

/**
 * What the run is filed under on this screen and in the yard.
 *
 * A press run has no grade - it moulded a product - so it is grouped by the
 * product instead, which is also what the stock group it files into is keyed on.
 * Everything else is its grade, and a run with none is coarse.
 */
const gradeOf = (run: Run) => (isPress(run) ? (run.product ?? 'Moulded') : (run.quality ?? 'Coarse'));

/**
 * Packing - the door everything the plant makes comes into the yard by.
 *
 * Two benches, listed together because they are one job on the floor: the shift
 * finishes, and what it made gets counted into stock.
 *
 *   bagging  everything weighed goes out in 50 kg sacks, and the remainder
 *            under one sack is not bagged - it is carried into the next batch of
 *            the same grade. That carry is the whole reason this is its own step
 *            rather than a number typed on the Weigh tab.
 *   boxing   a press moulds finished goods and counts them one at a time. There
 *            is nothing to weigh and nothing to carry: the only question is how
 *            many were boxed, and the pack they go into is read off the product
 *            rather than asked for, so nobody can file a hundred loose pieces as
 *            two packs of fifty.
 *
 * Boxing is new here, and it is the reason the Stock page could not previously
 * answer the question it exists to answer. A press run's pieces stopped at the
 * run: the yard could be holding four thousand loops and the page said nothing,
 * because nothing had ever filed them.
 */
export function PackingPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { pendingPack, loading } = useAppSelector((s) => s.runs);
  const [target, setTarget] = useState<Run | null>(null);
  const [count, setCount] = useState('');
  const [grade, setGrade] = useState('');

  useEffect(() => {
    void dispatch(fetchPendingPack());
  }, [dispatch]);

  /*
   * The grades and products actually waiting, rather than everything the plant
   * makes. A bench works one thing at a time and the crew wants the rest off the
   * screen, but offering one with nothing under it is a dead option on a tablet
   * - it is picked once, shows an empty list, and is never trusted again.
   */
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
    setCount(
      String(
        isPress(run)
          ? (run.packed_pieces ?? run.pieces ?? '')
          : (run.packed_sacks ?? sacksNeeded(run) ?? ''),
      ),
    );
  };

  const boxing = Boolean(target && isPress(target));
  const entered = Number(count) || 0;
  const moulded = Number(target?.pieces ?? 0);
  const leftOut = target && !boxing ? round2(totalFor(target) - entered * SACK_KG) : 0;
  /** Pieces moulded but not yet boxed - what is still owed to the yard. */
  const unboxed = boxing ? moulded - entered : 0;

  const save = async () => {
    if (!target) return;
    if (!count.trim() || Number.isNaN(Number(count)) || entered < 0) {
      notify(boxing ? 'Enter the pieces boxed' : 'Enter the sacks packed', 'warn');
      return;
    }
    if (boxing && entered > moulded) {
      notify(`This run moulded ${moulded} pieces`, 'warn');
      return;
    }
    if (!boxing && leftOut < 0) {
      notify(`That is more than the ${totalFor(target)} kg available`, 'warn');
      return;
    }

    const result = await dispatch(
      packRun(
        boxing
          ? { id: target.id, pieces: entered }
          : {
              id: target.id,
              sacks: entered,
              leftoutIn: target.leftout_in ?? 0,
              leftoutOut: leftOut,
            },
      ),
    );
    const okay = packRun.fulfilled.match(result);
    // What is counted here is stock from here on: it shows up on the Stock tab
    // straight away, pending the lab, so the toast says where it went.
    notify(
      okay
        ? boxing
          ? `${entered} pieces boxed → Stock · awaiting QC`
          : `${entered} sacks packed → Stock · ${leftOut} kg carried forward`
        : boxing
          ? 'Could not record the boxing'
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
          hint="Weigh a quality on R4 or a coarse shift and it lands here to be bagged. A press run lands here to be boxed as soon as its pieces are counted."
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

      {/* One thing waiting is not something to filter, so the row only appears
          once there is a choice to make. */}
      {grades.length > 1 && (
        <div className="gradebar" role="group" aria-label="Filter by quality or product">
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
              // `.q-<Grade>` class its chip wears on the cards below. A product
              // has no colour of its own and falls through to the default.
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
          const press = isPress(run);
          const done = press ? (run.packed_pieces ?? 0) : (run.packed_sacks ?? 0);
          const total = totalFor(run);
          return (
            <div key={run.id} className="wcard">
              <div className="info">
                <div className="row1">
                  <BatchRef>{run.batch_no ?? dayMonth(run.shift_date)}</BatchRef>
                  <QualityChip quality={gradeOf(run)} />
                  {run.formulation && <FormChip>{run.formulation}</FormChip>}
                </div>
                {press ? (
                  done > 0 ? (
                    <small style={{ color: 'var(--elec)' }}>
                      {done} of {run.pieces ?? 0} pieces boxed
                    </small>
                  ) : (
                    <small>
                      moulded {run.pieces ?? 0} pieces
                      {run.flash_kg ? ` · ${run.flash_kg} kg flash` : ''}
                    </small>
                  )
                ) : done > 0 ? (
                  <small style={{ color: 'var(--elec)' }}>
                    {done} sacks packed · {round2(total - done * SACK_KG)} kg left
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
                {done > 0 ? 'Update ▸' : press ? 'Box ▸' : 'Pack ▸'}
              </Button>
            </div>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(target)}
        title={
          target
            ? `${boxing ? 'Box' : 'Pack'} ${target.batch_no ?? dayMonth(target.shift_date)} · ${gradeOf(target)}`
            : ''
        }
        subtitle={
          target
            ? boxing
              ? `${moulded} pieces moulded. The pack is read off the product, so only the count is entered here.`
              : `Weighed ${target.weight_kg ?? target.out_weight ?? 0} kg${
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
              {boxing ? 'Box into stock' : 'Pack & carry forward'}
            </Button>
          </>
        }
      >
        {target &&
          (boxing ? (
            <>
              <Readout label="Moulded on this run" value={`${moulded} pieces`} className="mb-2.5" />
              {/* What is still on the bench. A press run stays on this list
                  until every piece is accounted for, so the figure that keeps
                  it here is the one shown. */}
              <Readout
                label="Not yet boxed"
                value={`${unboxed} pieces`}
                valueColor={unboxed < 0 ? 'var(--err)' : unboxed > 0 ? 'var(--amber)' : 'var(--elec)'}
                className="mb-3.5"
              />
              <TextField
                label="Pieces boxed"
                note="filed as stock, pending the lab"
                type="number"
                inputMode="numeric"
                placeholder={String(moulded)}
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))}
              />
            </>
          ) : (
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
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))}
              />
            </>
          ))}
      </BottomSheet>
    </>
  );
}

export default PackingPage;
