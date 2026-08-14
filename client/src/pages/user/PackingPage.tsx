import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchPendingPack, packRun, unpackRun } from '@/features/machines/runsSlice';
import { toRequestError } from '@/api/axiosClient';
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
  gradeClass,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { ADMIN_ROLES, SACK_KG, isMoulding } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { clock24, dayMonth } from '@/utils/date';
import type { Run } from '@/types/models';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Weighed kg plus whatever the previous batch of this grade left behind. */
const totalFor = (run: Run) => round2((run.weight_kg ?? run.out_weight ?? 0) + (run.leftout_in ?? 0));
const sacksNeeded = (run: Run) => Math.max(0, Math.floor(totalFor(run) / SACK_KG));

/**
 * Boxed by the piece rather than bagged by weight - a press, and the sleeve and
 * loop benches. `isPress` keeps its name because the whole bagged/boxed split on
 * this screen was written against it; what it means now is "counted, not
 * weighed".
 */
const isPress = (run: Run) => run.kind === 'press' || isMoulding(run.kind);

/**
 * What the run is filed under on this screen.
 *
 * A press, a sleeve bench and a loop bench have no grade - they moulded a
 * product - so they are filed under the product. Everything else is its grade,
 * and a run with none is coarse.
 *
 * The product rather than the lot number, on the sleeve and loop side. The two
 * together are what the yard keys the stock on, but the number is not what the
 * bench is looking for on this list: a crew that has just finished a shift of
 * sleeves is looking for the word "Sleve", and a filter chip reading
 * `03/Aug/26-day` would say when rather than what - and say the same thing for
 * the loop bench beside them. The number is still on the card, in the reference
 * slot, which is where a batch number goes everywhere else in the app.
 */
const gradeOf = (run: Run) => {
  if (isPress(run)) return run.product ?? 'Moulded';
  return run.quality ?? 'Coarse';
};

const mouldedOf = (run: Run) => Number(run.pieces ?? 0);
const boxedOf = (run: Run) => Number(run.packed_pieces ?? 0);

/**
 * One line of the packing list, and it is one run - every card on this screen,
 * bagged or boxed.
 *
 * Nothing on this list is added to anything else. A bagged run could never be:
 * the sub-sack remainder is carried into the next batch of that grade, so two
 * runs cannot be totalled without deciding whose carry the answer belongs to.
 * Boxing has no such arithmetic - a piece is a piece - and for a while the
 * boxed side pooled by product on the strength of that, so a shift's presses
 * came up as one card with one count.
 *
 * They do not any more. A pooled count is a figure nobody on the floor can
 * check: the crew counts what came off a machine, not what came off a product,
 * and a total that spans three benches has to be cut back across them by a rule
 * the crew cannot see. Worse on the sleeve and loop side, where each run is a
 * lot of its own that the lab answers separately - a pooled figure there would
 * write pieces into a lot the bench did not mean to touch.
 *
 * So: one run, one card, one count, filed under the product or the grade it
 * made. What tells two cards of the same product apart is on the card - the lot
 * number where there is one, the machine and the time it started where there is
 * not.
 */
type PackCard = {
  key: string;
  press: boolean;
  /** What the card is filed under: the product, or the grade. */
  label: string;
  /**
   * The lot number for the reference slot, where the run has one. Null on a
   * press run, which moulds against a product and is never given a number.
   */
  batch: string | null;
  run: Run;
};

/**
 * What names the card in the reference slot.
 *
 * The lot number where the run has one - a batch of reclaim, a sleeve lot, a
 * loop lot. A press run is never given one: it moulds against a product rather
 * than a batch, and the slot used to hold the shift date on its own, in the
 * place a batch number goes, which read as the batch being a date.
 *
 * So a press names its press and when it started. That is what tells two cards
 * of the same product apart now that a shift's runs are listed rather than
 * pooled - three presses on SLEVE are `P3 · 03 Aug 06:40`, `P5 · 03 Aug 07:10`
 * and so on, not three rows reading the same thing.
 */
const refOf = ({ batch, run }: PackCard) =>
  batch ??
  [run.machine ?? run.machine_id, `${dayMonth(run.shift_date)} ${clock24(run.started_at)}`]
    .filter(Boolean)
    .join(' · ');

/**
 * Packing - the door everything the plant makes comes into the yard by.
 *
 * Two benches, listed together because they are one job on the floor: the shift
 * finishes, and what it made gets counted into stock. One run is one card on
 * either of them - nothing on this screen is added to anything else.
 *
 *   bagging  everything weighed goes out in 50 kg sacks, and the remainder
 *            under one sack is not bagged - it is carried into the next batch of
 *            the same grade. That carry is the whole reason this is its own step
 *            rather than a number typed on the Weigh tab.
 *   boxing   a press, a sleeve bench or a loop bench moulds finished goods and
 *            counts them one at a time. There is nothing to weigh and nothing to
 *            carry: the only question is how many of that run were boxed, and
 *            the pack they go into is read off the product rather than asked
 *            for, so nobody can file a hundred loose pieces as two packs of
 *            fifty.
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
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [target, setTarget] = useState<PackCard | null>(null);
  const [count, setCount] = useState('');
  const [grade, setGrade] = useState('');
  /**
   * Whether this account may undo a packing.
   *
   * The crew cannot, and the control is not drawn for it - DELETE
   * /runs/:id/pack is adminOnly, so the button would be a tap that comes back
   * 403. Nothing is taken away by that: the packed figure is absolute and
   * re-entering it is a correction, so a crew that bagged eleven and meant
   * twelve fixes it at the bench the way it always did. What needs the office
   * is taking the packing off altogether, because that pulls filed stock back
   * out of the yard.
   */
  const mayUnpack = useAppSelector((s) =>
    s.auth.user ? ADMIN_ROLES.includes(s.auth.user.role) : false,
  );
  /**
   * Which card is one tap from having its packing undone, and which is busy.
   *
   * One id rather than a flag per card, so arming a second disarms the first -
   * the same two-step the run delete and the lab-test delete use.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  /*
   * On mount, and whenever anything asks for a refresh.
   *
   * The second half is what a delete needs. This list was read once when the
   * tab opened and never again, so a run corrected out of existence in History
   * stayed on the bagging bench until the app was reloaded - a card the crew
   * could still open and pack, filing sacks against a run that no longer
   * exists. Same signal the yard and the lab tab already watch.
   */
  useEffect(() => {
    void dispatch(fetchPendingPack());
  }, [dispatch, refreshTick]);

  /**
   * The list itself: one card per run waiting, boxed ones first.
   *
   * Nothing is pooled - see the note on PackCard. The run is the unit that gets
   * written, keeps its own `packed_pieces` and its own guard against boxing more
   * than it moulded, and it is now also the unit the crew is asked about, so the
   * question and the record are the same thing.
   *
   * Boxed above bagged only so the two benches do not interleave. Within each,
   * the order the server sent them in.
   */
  const cards = useMemo<PackCard[]>(() => {
    const boxed: PackCard[] = [];
    const bagged: PackCard[] = [];

    for (const run of pendingPack) {
      const press = isPress(run);
      const card: PackCard = {
        key: run.id,
        press,
        label: gradeOf(run),
        batch: run.batch_no ?? null,
        run,
      };
      (press ? boxed : bagged).push(card);
    }

    return [...boxed, ...bagged];
  }, [pendingPack]);

  /*
   * The grades and products actually waiting, rather than everything the plant
   * makes. A bench works one thing at a time and the crew wants the rest off the
   * screen, but offering one with nothing under it is a dead option on a tablet
   * - it is picked once, shows an empty list, and is never trusted again.
   */
  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const card of cards) tally[card.label] = (tally[card.label] ?? 0) + 1;
    return tally;
  }, [cards]);

  // Widened to string: this is what the filter is set to, and it holds whatever
  // a chip carried rather than a member of the grade union.
  const grades = useMemo<string[]>(
    () => Object.keys(counts).sort((a, b) => a.localeCompare(b)),
    [counts],
  );

  const visible = useMemo(
    () => (grade ? cards.filter((card) => card.label === grade) : cards),
    [cards, grade],
  );

  /*
   * A grade that has just been bagged off the list stops being an option, and
   * leaving the picker on it would show an empty screen with no clue why. The
   * filter falls back to all rather than stranding the crew on a dead one.
   */
  useEffect(() => {
    if (grade && !grades.includes(grade)) setGrade('');
  }, [grade, grades]);

  const open = (card: PackCard) => {
    setTarget(card);
    const run = card.run;
    setCount(
      String(
        card.press
          ? (boxedOf(run) || mouldedOf(run) || '')
          : (run.packed_sacks ?? sacksNeeded(run) ?? ''),
      ),
    );
  };

  const boxing = Boolean(target?.press);
  /** The bagged card's run. Meaningless while boxing, and not read there. */
  const one = target && !target.press ? target.run : null;
  const entered = Number(count) || 0;
  const moulded = target ? mouldedOf(target.run) : 0;
  const leftOut = one ? round2(totalFor(one) - entered * SACK_KG) : 0;
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
      notify(`That is more than the ${totalFor(one!)} kg available`, 'warn');
      return;
    }

    /*
     * One card, one run, one write.
     *
     * `packed_pieces` is an absolute figure on the run rather than a delta, so
     * this is safe to re-enter: the same count resolves to the same yard, and a
     * correction from 800 to 870 moves seventy pieces rather than re-cutting
     * anything.
     */
    const res = await dispatch(
      packRun(
        boxing
          ? { id: target.run.id, pieces: entered }
          : { id: one!.id, sacks: entered, leftoutIn: one!.leftout_in ?? 0, leftoutOut: leftOut },
      ),
    );

    const okay = packRun.fulfilled.match(res);
    const result = okay ? res.payload : null;

    /*
     * The boxing bench says whether the pieces reached the yard, and it is not
     * the same question as whether the call succeeded.
     *
     * Filing the stock is not allowed to fail the request - the run is saved
     * either way - so a project that cannot hold moulded stock yet answered 200
     * and this screen said "→ Stock · awaiting QC" over a yard that had
     * received nothing. The count stays on screen when that happens rather than
     * the sheet closing on a job nobody did.
     */
    const filed = okay && result?.stock_filed !== false;
    const note = okay ? result?.stock_note : null;

    // What is counted here is stock from here on: it shows up on the Stock tab
    // straight away, pending the lab, so the toast says where it went.
    notify(
      !okay
        ? boxing
          ? 'Could not record the boxing'
          : 'Could not record the packing'
        : !filed
          ? (note ?? 'Recorded on the run, but it did not reach Stock')
          : boxing
            ? `${entered} pieces boxed → Stock · awaiting QC`
            : `${entered} sacks packed → Stock · ${leftOut} kg carried forward`,
      !okay ? 'err' : !filed ? 'warn' : 'ok',
    );
    if (okay && filed) setTarget(null);
  };

  /**
   * Take the packing off a run, and say what came back out of the yard.
   *
   * "Deleted" on its own would understate it by exactly the part somebody would
   * want to check: what this moves is stock, and the group empties - and goes
   * entirely when this run was the only thing in it. So the toast names the
   * group and the count, the same way the History tab's delete does.
   *
   * The server's refusals come straight through rather than being reworded
   * here. Both of them - already dispatched, or more than the group is holding
   * - name the document or the tab the work is actually on, and a screen that
   * replaced that with "could not remove the packing" would be throwing away
   * the only part of the answer that helps.
   */
  const undo = async (card: PackCard) => {
    setUndoing(card.run.id);
    const done = await dispatch(unpackRun(card.run.id));
    setUndoing(null);
    if (!unpackRun.fulfilled.match(done)) {
      setConfirming(null);
      notify(String(done.payload ?? toRequestError(done.error).message), 'err');
      return;
    }
    setConfirming(null);

    const { stock_cleared: cleared, stock_note: note } = done.payload;
    if (note) return notify(note, 'warn');
    notify(
      cleared
        ? `${refOf(card)} unpacked — ${
            cleared.removed
              ? `${cleared.label} cleared from stock`
              : `${cleared.taken} off ${cleared.label}`
          }`
        : `${refOf(card)} unpacked`,
      'ok',
    );
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
              // The selected fill is the grade's own colour, off the same class
              // its chip wears on the cards below - asked for by name rather
              // than assembled, since not every grade's class is `q-` and its
              // own name. A product has no colour and falls through to the
              // default.
              className={cn('gradebtn', grade === g && ['on', gradeClass(g)])}
              aria-pressed={grade === g}
              onClick={() => setGrade(g)}
            >
              {g} <span className="n">{counts[g]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="stack">
        {visible.map((card) => {
          const run = card.run;
          const done = card.press ? boxedOf(run) : (run.packed_sacks ?? 0);
          const total = totalFor(run);
          const armed = confirming === card.key;
          return (
            <div key={card.key} className={cn('wcard', armed && 'flex-wrap')}>
              <div className="info">
                <div className="row1">
                  {/* The lot, or the press and when it ran - see refOf(). */}
                  <BatchRef>{refOf(card)}</BatchRef>
                  <QualityChip quality={card.label} />
                  {!card.press && run.formulation && <FormChip>{run.formulation}</FormChip>}
                </div>
                {card.press ? (
                  <small style={done > 0 ? { color: 'var(--elec)' } : undefined}>
                    {done > 0
                      ? `${done} of ${mouldedOf(run)} pieces boxed`
                      : `moulded ${mouldedOf(run)} pieces`}
                  </small>
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
              <span className="flex flex-none items-center gap-1.5">
                {/* Only once something has actually been packed. A run nobody
                    has bagged yet has no packing to take off, and the server
                    says so - offering the button anyway would be a tap whose
                    only outcome is an error message. */}
                {mayUnpack && done > 0 && !armed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(card.key)}
                    title="Take this packing off and put the stock back out of the yard"
                  >
                    Remove
                  </Button>
                )}
                <Button variant="primary" onClick={() => open(card)}>
                  {done > 0 ? 'Update ▸' : card.press ? 'Box ▸' : 'Pack ▸'}
                </Button>
              </span>

              {/* The consequence spelled out beside the armed button rather
                  than left to the toast afterwards. What this moves is stock in
                  the yard, and the run staying put is the part worth saying -
                  it is what makes this different from the History tab's
                  delete, which takes the shift off the record as well. */}
              {armed && (
                <div className="w-full">
                  <div className="hint mt-2">
                    This takes {done} {card.press ? 'boxed pieces' : 'sacks'} back out of the yard
                    and puts {refOf(card)} back on the bench to be{' '}
                    {card.press ? 'boxed' : 'packed'} again. The run itself stays on the record.
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={undoing === card.run.id}
                      onClick={() => void undo(card)}
                    >
                      Yes, remove the packing
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(target)}
        title={
          /* The reference first, then what it made - the same shape on both
             benches, and on the boxed side it is what says which of the shift's
             runs this sheet is about. */
          target
            ? `${boxing ? 'Box' : 'Pack'} ${refOf(target)} · ${target.label}`
            : ''
        }
        subtitle={
          target
            ? boxing
              ? `${moulded} pieces moulded on this run. The pack is read off the product, so only the count is entered here.`
              : `Weighed ${one?.weight_kg ?? one?.out_weight ?? 0} kg${
                  one?.leftout_in ? ` + ${one.leftout_in} kg carried = ${totalFor(one)} kg` : ''
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
            one && (
              <>
                {(one.leftout_in ?? 0) > 0 && (
                  <Readout
                    label="Carried in from last batch"
                    value={`+${one.leftout_in} kg`}
                    valueColor="var(--elec)"
                    className="mb-2.5"
                  />
                )}
                <Readout
                  label="Full sacks"
                  value={`${sacksNeeded(one)} sacks · ${sacksNeeded(one) * SACK_KG} kg`}
                  className="mb-2.5"
                />
                <Readout
                  label={`Left out → next ${target.label} batch`}
                  value={`${leftOut} kg`}
                  valueColor={leftOut < 0 ? 'var(--err)' : 'var(--amber)'}
                  className="mb-3.5"
                />
                <TextField
                  label="Sacks packed"
                  type="number"
                  inputMode="numeric"
                  placeholder={String(sacksNeeded(one))}
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))}
                />
              </>
            )
          ))}
      </BottomSheet>
    </>
  );
}

export default PackingPage;
