import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import {
  attachReport,
  fetchPendingQuality,
  fetchQualitySummary,
  recordTest,
  removeTest,
} from '@/features/quality/qualitySlice';
import {
  batchQc,
  batchQcChip,
  removedText,
  type BatchQc,
  type GradeStatus,
} from '@/features/quality/qc';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FieldRow,
  FormChip,
  PageLoader,
  Pick,
  QualityChip,
  Readout,
  SheetLabel,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import {
  DELETE_ROLES,
  QC_PARAM_SUGGEST,
  QC_REPORT_MAX_BYTES,
  SUPERVISORS,
  counted,
} from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { currentShift, dayLong, dayMonth, lastNDays, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type {
  Batch,
  MouldedStock,
  PoolSlot,
  Quality,
  QualityParam,
  StockPool,
  Verdict,
} from '@/types/models';

/**
 * The lab's tab. A batch is tested grade by grade - each one gets its own
 * readings, its own verdict and its own report - so the tab opens on the
 * batches, a batch opens on its grades, and a grade opens on the test itself.
 *
 * A hold does not block anything by itself: it flags the batch on Dispatch so
 * whoever is loading the vehicle has to make the call knowingly.
 */

/**
 * The test being written up, until it is filed.
 *
 * One draft covers both kinds, because the readings, the verdict, the tester
 * and the report are the same act whichever is being written. What differs is
 * what it is filed against: a batch and one of its grades, or a coarse pool and
 * one of its three sample points. `pool` is set on exactly one of the two, and
 * is what decides which.
 */
interface Draft {
  batch: Batch | null;
  /** Set when this is a coarse sample rather than a batch's grade. */
  pool: { pool: StockPool; slot: PoolSlot } | null;
  /**
   * Set when this is a verdict on what a press moulded.
   *
   * The third kind, and it is filed against a product rather than a grade -
   * the bench tests loops, not a grade of rubber. `grade` therefore carries the
   * product's id on a moulded draft, which is exactly what the column holds on
   * the test row and what the stock group is keyed on.
   */
  moulded: MouldedStock | null;
  /**
   * The batch of compound the press was running, typed at the bench off the
   * sample's own label.
   *
   * Asked for rather than derived, because a moulded stock group is keyed on the
   * product and the pack it is boxed in and spans however many batches were
   * moulded into it - so there is no single batch on the row to read back. The
   * verdict still records which one was tested, which is what a re-test is filed
   * against and what makes the record mean anything later.
   */
  batchNo: string;
  /**
   * The verdict already standing here, where there is one.
   *
   * The sheet is opened on a grade or a sample point rather than on a test, so
   * this is what says whether that point has been answered before - which is
   * what a re-test starts from, and what the delete at the foot of the sheet
   * acts on. Null on a moulded draft, which is opened on a stock group: the
   * verdict on those is addressed by product and batch rather than kept on the
   * row, so there is no single test to offer here.
   */
  test: StandingTest | null;
  grade: Quality | 'Coarse' | string;
  params: QualityParam[];
  verdict: Verdict;
  testedBy: string;
  /**
   * The day a pool sample was taken. Not decoration - the server works out
   * which of the three slots the sample lands in from this date and nothing
   * else, so it is bounded to the slot's own range in the sheet. A sample
   * logged late would otherwise file itself into whichever slot today is in.
   */
  sampledOn: string;
  notes: string;
  /** A report already on file - kept unless a new file replaces it. */
  attachmentUrl: string;
  attachmentName: string;
  file: { name: string; type: string; dataUrl: string } | null;
}

/** `2026-08-04` -> `04 Aug`, for a slot's date range. */
const slotRange = (slot: PoolSlot) => `${dayMonth(slot.from)} – ${dayMonth(slot.to)}`;

/** "2 of 3 sampled", and whether anything came back a hold. */
const poolHint = (pool: StockPool) => {
  if (pool.any_hold) return `${pool.samples_taken} of ${pool.samples_total} sampled · a hold on record`;
  if (pool.samples_taken === pool.samples_total) return 'All three samples passed';
  if (!pool.samples_taken) return 'Not sampled yet';
  return `${pool.samples_taken} of ${pool.samples_total} sampled`;
};

/**
 * The verdict a sheet was opened on, in the fields the sheet actually uses.
 *
 * One field carries both kinds because it is one row on the server served by two
 * serializers: a batch grade's verdict arrives as a QualityTest and a pool
 * sample's as a PoolSample, and they differ only in that the pool's `grade`
 * widens to take 'Coarse'. Narrowing to what the two share is truer than casting
 * one into the other, and it is exactly what the delete below needs - the id to
 * send, and enough of the rest to say what is about to go.
 */
interface StandingTest {
  id: string;
  verdict: Verdict;
  grade: string;
  batch_no?: string | null;
  tested_at?: string | null;
  tested_by?: string | null;
  tester?: string | null;
  params?: QualityParam[];
}

const emptyEntry = { name: '', value: '', unit: '' };

/** When the batch went into the autoclave - how old the material is. */
const chargedText = (batch: Batch) => {
  const when = batch.opened_at ? dayMonth(batch.opened_at) : batch.shift_date ? dayLong(batch.shift_date) : null;
  return [batch.machine_id, when && `charged ${when}`].filter(Boolean).join(' · ');
};

const readings = (test: { params?: QualityParam[] }) => {
  const count = test.params?.length ?? 0;
  return count ? `${count} reading${count > 1 ? 's' : ''}` : 'no readings';
};

const chipStyle = (tone: ReturnType<typeof batchQcChip>['tone']) =>
  tone === 'ok'
    ? { background: 'var(--ok)', color: 'var(--on-fill)' }
    : tone === 'part'
      ? { background: 'var(--pause)', color: 'var(--on-fill)' }
      : undefined;

/** "2 grades awaiting test", "All grades passed", "1 grade on hold". */
const batchHint = (qc: BatchQc) => {
  if (!qc.allDone) return `${qc.untested} grade${qc.untested > 1 ? 's' : ''} awaiting test`;
  if (qc.anyHold) return `${qc.hold} grade${qc.hold > 1 ? 's' : ''} on hold`;
  return 'All grades passed';
};

/**
 * Where a batch stands, as one word, for the filter above the list.
 *
 * Three states that partition the list rather than overlap it - every batch is
 * in exactly one, so the counts on the chips add up to the total and a bench
 * can read the row as "what is left to do". A hold outranks an untested grade
 * because a hold is the thing somebody has to act on; the same precedence
 * batchQcChip() already uses on the card, so the filter and the chip it
 * filtered by cannot disagree.
 */
type QcState = 'awaiting' | 'hold' | 'passed';

const stateOf = (qc: BatchQc): QcState => (qc.anyHold ? 'hold' : qc.allDone ? 'passed' : 'awaiting');

/** Awaiting first - the bench's work queue is the reason to open this tab. */
const QC_STATES: QcState[] = ['awaiting', 'hold', 'passed'];

const STATE_LABEL: Record<QcState, string> = {
  awaiting: 'Awaiting',
  hold: 'On hold',
  passed: 'Passed',
};

/**
 * The tint each state wears. These are the app's status colours as `.pill.ok` /
 * `.warn` / `.down` wear them everywhere else, reached through the same three
 * modifiers the Stock view's verdict filter uses - so this is the same control,
 * not a second one that resembles it.
 */
const STATE_CLASS: Record<QcState, string> = {
  awaiting: 'qc-pending',
  hold: 'qc-fail',
  passed: 'qc-pass',
};

export function QualityPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { batches, pending, tests, summary, loading } = useAppSelector((s) => s.quality);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  // Whoever is signed in on this device is the default tester.
  const supervisor = useAppSelector((s) => s.auth.user?.name ?? '');
  /**
   * Whether this account may take a test off the record.
   *
   * The admin account alone - not the bench, and not a manager either. See
   * DELETE_ROLES, and note that this is narrower than the rest of the back
   * office's reach on purpose.
   *
   * The bench does not need it: tests are append-only here by design - the lab
   * corrects itself by filing again, and the newest verdict standing is the one
   * the yard reads. Neither does a manager, who can already move goods the
   * reversible way with PATCH /stock/:id/qc. What is behind this list is the one
   * edit a re-test cannot make - a verdict filed against the wrong batch or the
   * wrong grade, which goes on releasing goods it was never about because every
   * re-test lands on a different key - and it cannot be undone once it is done.
   *
   * DELETE /quality-tests/:id is gated the same way on the server, so drawing
   * this any wider would be offering a tap that comes back 403.
   */
  const mayRemove = useAppSelector((s) =>
    s.auth.user ? DELETE_ROLES.includes(s.auth.user.role) : false,
  );

  /** The batch whose grades are listed, and the grade being written up. */
  const [target, setTarget] = useState<Batch | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [entry, setEntry] = useState(emptyEntry);
  const [saving, setSaving] = useState(false);
  /** Which state the list is narrowed to. Empty is all of them. */
  const [state, setState] = useState<QcState | ''>('');
  /**
   * Which verdict is one tap from being deleted, and which is being deleted.
   *
   * One id rather than a flag per row, so arming a second row disarms the
   * first. A delete moves stock in the yard and there is no undo behind it, so
   * it is not a single tap.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /** The coarse pools and their sample slots - the other half of the bench's work. */
  const [pools, setPools] = useState<StockPool[]>([]);
  /**
   * What the presses have made, by product and pack.
   *
   * The bench's third list. It is here because a moulded group is reachable
   * from nowhere else: a batch is found through the batch card and a pool
   * through the list above, and a group keyed on a product and a pack is on
   * neither. Boxed pieces open `pending` and cannot be dispatched until the lab
   * answers, so without this the presses' output has no way out of the yard.
   */
  const [moulded, setMoulded] = useState<MouldedStock[]>([]);

  const loadPools = useCallback(async () => {
    /*
     * Settled rather than awaited together: the two lists are separate halves
     * of the bench's work and either is worth having on its own, so one failing
     * must not take the other down with it - nor the batch list, which is the
     * whole reason this is caught here at all.
     */
    const [pooled, pressed] = await Promise.allSettled([
      stockService.pools({ limit: 12 }),
      stockService.moulded({ limit: 40 }),
    ]);
    if (pooled.status === 'fulfilled') setPools(pooled.value.rows);
    if (pressed.status === 'fulfilled') setMoulded(pressed.value.rows);

    const failed = [pooled, pressed].find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') notify(toRequestError(failed.reason).message, 'err');
  }, [notify]);

  /*
   * Filing a verdict bumps refreshTick - see recordTest - so the pools re-read
   * themselves without save() having to remember to. That matters here because
   * which slot a sample landed in is the server's answer, worked out from the
   * date rather than sent, so the only way to know is to ask again.
   */
  useEffect(() => {
    void dispatch(fetchPendingQuality());
    void dispatch(fetchQualitySummary(lastNDays(30)));
    void loadPools();
  }, [dispatch, loadPools, refreshTick]);

  /*
   * The pools, on a timer and whenever the bench comes back to the screen.
   *
   * A pool appears here because somebody packed coarse on another device, and
   * the ten-day period it belongs to opens without anybody at the bench doing
   * anything - so a lab tablet left open would otherwise never learn that there
   * is a new period to sample.
   */
  useRefreshOnFocus(loadPools, { intervalMs: 30_000 });

  /** Newest batch first, each with where its grades stand. */
  const cards = useMemo(
    () =>
      [...batches]
        .sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? ''))
        .map((batch) => ({ batch, qc: batchQc(batch, tests) })),
    [batches, tests],
  );

  /* How many batches are in each state, for the counts on the chips. Offering a
     state with nothing under it is a dead tap on a tablet, so a chip is only
     drawn for a state the bench actually has work in. */
  const stateCounts = useMemo(() => {
    const tally = {} as Record<QcState, number>;
    for (const card of cards) {
      const key = stateOf(card.qc);
      tally[key] = (tally[key] ?? 0) + 1;
    }
    return tally;
  }, [cards]);

  /*
   * Filtered here rather than refetched. This is a couple of dozen batches at
   * most and the whole set is already in the store - a round trip per tap would
   * be slower than the bench can read.
   */
  const visible = useMemo(
    () => (state ? cards.filter((card) => stateOf(card.qc) === state) : cards),
    [cards, state],
  );

  /* Filing the last hold empties a filter that is still switched on, which
     shows a blank screen with no clue why. It falls back to all instead. */
  useEffect(() => {
    if (state && !stateCounts[state]) setState('');
  }, [state, stateCounts]);

  const openGrades = target ? (cards.find((c) => c.batch.id === target.id)?.qc ?? null) : null;

  const openGrade = (batch: Batch, status: GradeStatus) => {
    const prev = status.test;
    setEntry(emptyEntry);
    setDraft({
      batch,
      pool: null,
      moulded: null,
      batchNo: '',
      test: prev ?? null,
      grade: status.grade,
      // A re-test starts from what was measured last time rather than blank.
      params: prev?.params ? prev.params.map((p) => ({ ...p })) : [],
      verdict: prev?.verdict ?? 'pass',
      testedBy: prev?.tested_by ?? prev?.tester ?? (supervisor || SUPERVISORS[0] || ''),
      sampledOn: '',
      notes: '',
      attachmentUrl: prev?.attachment_url ?? '',
      attachmentName: prev?.attachment_name ?? '',
      file: null,
    });
  };

  /** One of a pool's three sample points, empty or being re-sampled. */
  const openSlot = (pool: StockPool, slot: PoolSlot) => {
    const prev = slot.test;
    const today = todayISO();
    setEntry(emptyEntry);
    setDraft({
      batch: null,
      pool: { pool, slot },
      moulded: null,
      batchNo: '',
      test: prev ?? null,
      grade: 'Coarse',
      params: prev?.params ? prev.params.map((p) => ({ ...p })) : [],
      verdict: prev?.verdict ?? 'pass',
      testedBy: prev?.tested_by ?? (supervisor || SUPERVISORS[0] || ''),
      /*
       * Today when today is inside this slot, and the nearest day of it
       * otherwise. Logging the first sample on the ninth is normal - the bench
       * writes up a sheet from earlier in the period - and dating it today
       * would file it as the third sample instead, leaving the first empty
       * forever.
       */
      sampledOn:
        prev?.sampled_on ??
        (today < slot.from ? slot.from : today > slot.to ? slot.to : today),
      notes: '',
      attachmentUrl: prev?.attachment_url ?? '',
      attachmentName: prev?.attachment_name ?? '',
      file: null,
    });
  };

  /**
   * A verdict on what a press moulded.
   *
   * `grade` carries the product rather than a grade of rubber, because that is
   * what the bench actually tested and what the stock group is keyed on. The
   * batch of compound is typed in: a moulded group spans however many batches
   * were boxed into it, so there is nothing on the row to read one back from,
   * and the sample on the bench is labelled with its own.
   */
  const openMoulded = (row: MouldedStock) => {
    setEntry(emptyEntry);
    setDraft({
      batch: null,
      pool: null,
      moulded: row,
      /*
       * A sleeve or loop lot carries its own number.
       *
       * `batch_no` is the shift it was made on - 03/Aug/26-day - and the verdict
       * is addressed by that and the product together, both of which are on the
       * row. So it is filled in rather than typed and there is nothing for the
       * bench to look up. A press's group is the other case entirely: it pools
       * however many batches of compound were boxed into it, so there is nothing
       * on the row to read one back from and the sample on the bench is labelled
       * with its own.
       */
      batchNo: row.kind === 'lot' ? (row.batch_no ?? '') : '',
      test: null,
      grade: row.product_id ?? row.quality ?? '',
      params: [],
      verdict: 'pass',
      testedBy: supervisor || SUPERVISORS[0] || '',
      sampledOn: '',
      notes: '',
      attachmentUrl: '',
      attachmentName: '',
      file: null,
    });
  };

  const addParam = () => {
    const name = entry.name.trim();
    const value = entry.value.trim();
    if (!name) return notify('Name the parameter', 'warn');
    if (!value) return notify('Enter the value', 'warn');
    setDraft((d) =>
      d ? { ...d, params: [...d.params, { name, value, unit: entry.unit.trim() || undefined }] } : d,
    );
    setEntry(emptyEntry);
  };

  const removeParam = (at: number) =>
    setDraft((d) => (d ? { ...d, params: d.params.filter((_, i) => i !== at) } : d));

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > QC_REPORT_MAX_BYTES) return notify('File too large (max 8 MB)', 'warn');
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((d) =>
        d ? { ...d, file: { name: file.name, type: file.type, dataUrl: String(reader.result) } } : d,
      );
    reader.onerror = () => notify('Could not read that file', 'err');
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!draft) return;
    const notes = draft.notes.trim();
    if (!draft.params.length && !notes && !draft.file && !draft.attachmentUrl) {
      notify('Add at least one test parameter for this grade', 'warn');
      return;
    }
    /*
     * A moulded verdict used to be blocked here until a batch was typed, and
     * that was a door with nothing behind it: a press run records no batch
     * number, so there was nothing the bench could put in the box. The verdict
     * never filed, the pieces stayed `pending`, and a product that cannot be
     * passed cannot be dispatched at all. The field stays for the runs that do
     * carry one - see the note on the input - but it does not gate the verdict.
     */

    setSaving(true);
    const common = {
      grade: draft.grade,
      verdict: draft.verdict,
      params: draft.params,
      testedBy: draft.testedBy.trim() || supervisor || SUPERVISORS[0],
      shift: currentShift(),
      remarks: notes || null,
      // A new file replaces the old report; without one the old still stands.
      attachmentUrl: draft.file ? null : draft.attachmentUrl || null,
      attachmentName: draft.file ? null : draft.attachmentName || null,
    };

    /*
     * A pool sample is filed against the pool's stored label and the day it was
     * taken - the server derives its slot from that date, so the display label
     * would not do here even though it is the one on the screen.
     */
    const filed = await dispatch(
      recordTest(
        draft.pool
          ? {
              ...common,
              kind: 'pool',
              batchNo: draft.pool.pool.label,
              shiftDate: draft.sampledOn,
            }
          : draft.moulded
            ? {
                ...common,
                /*
                 * Which of the two moulded verdicts this is, and it decides what
                 * the verdict moves.
                 *
                 * `lot` is addressed by the batch number and releases that shift
                 * of sleeve or loop alone. `product` is addressed by the product
                 * and moves every pack of it in the yard - which is right for a
                 * press, where the goods are pooled by product and pack in the
                 * first place, and would be far too blunt for a lot.
                 */
                kind: draft.moulded.kind === 'lot' ? 'lot' : 'product',
                /*
                 * On a lot: the shift it was made on, which with `grade` on
                 * `common` - the product - is the key the verdict is addressed
                 * by. Both halves go, and the server refuses a lot verdict
                 * missing either: the number is `03/Aug/26-day` and the sleeve
                 * bench and the loop bench both worked that shift.
                 *
                 * On a press's group: the batch of compound off the sample's own
                 * label, which is provenance - `grade` is already the product,
                 * and that is what such a verdict releases.
                 */
                batchNo: draft.batchNo.trim(),
                shiftDate: todayISO(),
              }
            : {
                ...common,
                kind: 'batch',
                batchNo: draft.batch?.ref,
                machineId: draft.batch?.machine_id,
                shiftDate: todayISO(),
              },
      ),
    );

    if (!recordTest.fulfilled.match(filed)) {
      setSaving(false);
      notify(
        draft.pool
          ? `Could not file sample ${draft.pool.slot.slot} for ${draft.pool.pool.display_label}`
          : `Could not file the verdict for ${draft.grade}`,
        'err',
      );
      return;
    }

    let reportFailed = false;
    if (draft.file) {
      const uploaded = await dispatch(
        attachReport({ id: filed.payload.id, name: draft.file.name, dataUrl: draft.file.dataUrl }),
      );
      reportFailed = !attachReport.fulfilled.match(uploaded);
      if (!reportFailed) void dispatch(fetchPendingQuality());
    }
    setSaving(false);

    const verdict = draft.verdict === 'hold' ? 'held' : 'passed';
    const what = draft.pool
      ? `${draft.pool.pool.display_label} · sample ${draft.pool.slot.slot}`
      : draft.moulded
        ? draft.moulded.kind === 'lot'
          ? // Both halves of the key, which is what was actually certified.
            `${draft.batchNo.trim()} · ${draft.grade}`
          : // The batch is optional on a press verdict, and the usual case is
            // that there is not one - so the product stands alone rather than
            // trailing a separator with nothing after it.
            [draft.moulded.display_label, draft.batchNo.trim()].filter(Boolean).join(' · ')
        : `${draft.batch?.ref} · ${draft.grade}`;

    /*
     * What the verdict actually moved in the yard.
     *
     * A verdict releases stock that already exists; it does not create any. So
     * passing a grade nobody has bagged yet is correct and moves nothing - and
     * from the bench that is indistinguishable from the app having failed. It
     * says which happened rather than leaving the difference to be guessed.
     */
    const released = filed.payload.stock_released;
    const moved = released
      ? ` · ${counted(released.available_qty ?? released.available_sacks, released.unit ?? 'sacks')} released`
      : draft.verdict === 'pass' && !draft.pool
        ? draft.moulded
          ? ' · nothing boxed against it in the yard yet'
          : ' · nothing in the yard against it yet'
        : '';

    notify(
      reportFailed
        ? `${what} ${verdict} — the report did not upload`
        : `${what} ${verdict}${moved}`,
      reportFailed || draft.verdict === 'hold' || (draft.verdict === 'pass' && !released && !draft.pool)
        ? 'warn'
        : 'ok',
    );
    setDraft(null); // back to the batch's grades, or to the pools
  };

  /**
   * Take a verdict off the record, and say what it moved in the yard.
   *
   * The thunk re-reads the pending batches and bumps the refresh tick, so this
   * page's own lists and anything open beside it - the back office's lab
   * record, the pass-rate bars, the yard - all redraw without the verdict
   * rather than going on showing what it was releasing.
   */
  const remove = async (test: StandingTest) => {
    setRemoving(test.id);
    const done = await dispatch(removeTest(test.id));
    setRemoving(null);
    setConfirming(null);
    if (!removeTest.fulfilled.match(done)) {
      notify(`Could not remove the ${test.grade} verdict on ${test.batch_no ?? 'this batch'}`, 'err');
      return false;
    }
    notify(`${test.batch_no ?? 'Test'} · ${test.grade} removed — ${removedText(done.payload)}`, 'ok');
    return true;
  };

  /**
   * The same delete, from the sheet the verdict is being read in.
   *
   * The list of recent verdicts below only carries the newest dozen, and a
   * verdict filed against the wrong grade is usually found by opening that grade
   * and seeing what is standing on it - which is here. So the control is offered
   * where the mistake is actually seen rather than only where the newest rows
   * happen to be listed. It is the one call either way, so the two cannot come
   * apart.
   *
   * The sheet closes on success: what it was opened to show is gone, and leaving
   * it up would offer a re-test seeded from a verdict that no longer exists.
   */
  const removeFromSheet = async (test: StandingTest) => {
    if (await remove(test)) setDraft(null);
  };

  /** Shut the sheet, and disarm anything armed inside it. */
  const closeDraft = () => {
    setConfirming(null);
    setDraft(null);
  };

  if (loading && !batches.length && !tests.length) return <PageLoader label="Loading quality" />;

  /**
   * One filter chip. Same shape the Stock view's bars are built from.
   *
   * Named `filterChip` rather than `chip` because the card loop below binds a
   * `chip` of its own off batchQcChip() - two different things, and one of them
   * shadowing the other reads as a bug every time somebody comes back to it.
   */
  const filterChip = (
    label: string,
    count: number,
    on: boolean,
    modifier: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={cn('gradebtn', modifier, on && 'on')}
      aria-pressed={on}
      onClick={onClick}
    >
      {label} <span className="n">{count}</span>
    </button>
  );

  return (
    <>
      <ViewHead
        meta={
          state
            ? `${visible.length} of ${cards.length} batches · ${STATE_LABEL[state].toLowerCase()}`
            : `${pending.length} awaiting test`
        }
      />

      {summary.length > 0 && (
        <div className="panel mb-3">
          {summary.map((row) => (
            <div key={row.grade} className="wq">
              <QualityChip quality={row.grade} />
              <div className="wbar">
                <i
                  style={{
                    width: `${row.passRate}%`,
                    background: row.passRate >= 90 ? 'var(--ok)' : 'var(--warn)',
                  }}
                />
              </div>
              <span className="val">
                {row.passRate}% <span className="muted">/{row.total}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/*
        Coarse, which is not tested the way a batch is.

        There is no lot to certify - the line runs for a shift, the sacks pool
        by ten-day period - so the period is sampled three times instead. The
        slots are dated stretches rather than a running list, because a sample
        nobody took is then an empty box on the screen rather than an absence
        nobody can see.

        Absence is not refusal, and refusal is refusal. A pool nobody has
        sampled sells - coarse is bulk output sold on the line running to
        specification, and waiting for a certificate per pool is what used to
        strand every sack. A pool the lab has held does not sell: holding a
        sample stops the period, which is what the samples are for.
      */}
      {pools.length > 0 && (
        <>
          <SheetLabel className="mx-0.5 mb-2 mt-1">
            Coarse pools{' '}
            <span className="muted normal-case tracking-normal">
              — three samples across each ten-day period
            </span>
          </SheetLabel>
          <div className="stack mb-3">
            {pools.map((pool) => (
              <article key={pool.id} className={cn('bcard', pool.any_hold && 'hold')}>
                <div className="bhead">
                  <div className="l">
                    <BatchRef className="text-base">{pool.display_label}</BatchRef>
                    <QualityChip quality="Coarse" />
                  </div>
                  <span
                    className={cn('qchip', pool.any_hold && 'hold')}
                    style={
                      pool.any_hold
                        ? undefined
                        : pool.samples_taken === pool.samples_total
                          ? { background: 'var(--ok)', color: 'var(--on-fill)' }
                          : { background: 'var(--pause)', color: 'var(--on-fill)' }
                    }
                  >
                    {pool.samples_taken}/{pool.samples_total}
                  </span>
                </div>

                <div className="qslots">
                  {pool.slots.map((slot) => {
                    const test = slot.test;
                    return (
                      <button
                        key={slot.slot}
                        type="button"
                        className={cn(
                          'qslot',
                          test && (test.verdict === 'hold' ? 'hold' : 'pass'),
                        )}
                        onClick={() => openSlot(pool, slot)}
                      >
                        <b>Sample {slot.slot}</b>
                        <small>{slotRange(slot)}</small>
                        <span className="v">
                          {test ? (test.verdict === 'hold' ? 'HOLD' : 'Passed') : 'Not taken'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="bhint mt-2">
                  {pool.available_sacks} sacks in the yard · {poolHint(pool)}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/*
        What the presses have made.

        The bench's third list, and the only way it can reach moulded goods at
        all: a group here is keyed on its product and the pack it is boxed in,
        so it is on neither the batch card nor the pool list above. Boxed pieces
        open pending and cannot leave the yard until this is answered.

        Unlike coarse there is a lot to certify - a press runs a batch of
        compound - so the rule is the batch rule rather than the pool rule:
        nothing is released until the bench says so. Everything is listed
        whatever its verdict, because a pack on hold is the one somebody has to
        do something about and a passed one is what says the work is done.
      */}
      {moulded.length > 0 && (
        <>
          <SheetLabel className="mx-0.5 mb-2 mt-1">
            Moulded goods{' '}
            <span className="muted normal-case tracking-normal">
              — pass / hold per product and pack
            </span>
          </SheetLabel>
          <div className="stack mb-3">
            {moulded.map((row) => (
              <article
                key={row.id}
                className={cn('bcard', row.qc_status === 'fail' && 'hold')}
              >
                <div className="bhead">
                  {/* The shift a lot was made on, with the product beside it -
                      the two halves of what this verdict will be addressed by,
                      shown the way they are keyed. A press's group has no
                      number and keeps its label, `LOOP-50`, which names the
                      product and the pack it is boxed in. */}
                  <div className="l">
                    <BatchRef className="text-base">{row.batch_no || row.display_label}</BatchRef>
                    <QualityChip quality={row.product_id ?? '—'} />
                  </div>
                  <span
                    className={cn('qchip', row.qc_status === 'fail' && 'hold')}
                    style={
                      row.qc_status === 'fail'
                        ? undefined
                        : row.qc_status === 'pass'
                          ? { background: 'var(--ok)', color: 'var(--on-fill)' }
                          : { background: 'var(--pause)', color: 'var(--on-fill)' }
                    }
                  >
                    {row.qc_status === 'pass'
                      ? 'Passed'
                      : row.qc_status === 'fail'
                        ? 'HOLD'
                        : 'Not tested'}
                  </span>
                </div>

                <div className="bhint mt-2">
                  {[
                    `${counted(row.available_qty, row.unit)} in the yard`,
                    row.pack_size ? `${row.pack_size} to a pack` : 'boxed loose',
                    row.last_packed_on ? `packed ${dayMonth(row.last_packed_on)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => openMoulded(row)}
                >
                  {row.qc_status === 'pending' ? 'Record a result ▸' : 'Re-test ▸'}
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      {!cards.length ? (
        pools.length || moulded.length ? null : (
          <EmptyState
            icon={icons.quality}
            title="Nothing to test yet"
            hint="Once a special batch is loaded it shows up here for you to log results, grade by grade. A press run appears once its pieces are boxed."
          />
        )
      ) : (
        <>
          <SheetLabel className="mx-0.5 mb-2 mt-1">
            Special batches <span className="muted normal-case tracking-normal">— pass / hold per grade</span>
          </SheetLabel>

          {/* One state in the list is not something to filter by - every chip
              would say the same thing and the row would only cost height. */}
          {Object.keys(stateCounts).length > 1 && (
            <div className="gradebar" role="group" aria-label="Filter batches by test state">
              {filterChip('All', cards.length, !state, 'all-grades', () => setState(''))}
              {QC_STATES.filter((key) => stateCounts[key]).map((key) =>
                filterChip(
                  STATE_LABEL[key],
                  stateCounts[key] ?? 0,
                  state === key,
                  STATE_CLASS[key],
                  () => setState(key),
                ),
              )}
            </div>
          )}

          {/* Only reachable with a filter on - unfiltered, a non-empty list of
              batches is a non-empty list of cards. */}
          {state && !visible.length ? (
            <p className="empty">No batches are {STATE_LABEL[state].toLowerCase()}.</p>
          ) : (
            <div className="stack">
              {visible.map(({ batch, qc }) => {
                const chip = batchQcChip(qc);
                const charged = chargedText(batch);
                return (
                  <button
                    key={batch.id}
                    type="button"
                    className="bcard w-full text-left"
                    onClick={() => setTarget(batch)}
                  >
                    <div className="bhead">
                      <div className="l">
                        <BatchRef className="text-base">{batch.ref}</BatchRef>
                        {batch.formulation && <FormChip>{batch.formulation}</FormChip>}
                      </div>
                      <span
                        className={cn(
                          'qchip',
                          chip.tone === 'hold' && 'hold',
                          chip.tone === 'none' && 'shift',
                        )}
                        style={chipStyle(chip.tone)}
                      >
                        {chip.label}
                      </span>
                    </div>

                    <div className="bgrade">
                      {qc.grades.map((g) => (
                        <span
                          key={g.grade}
                          className={cn(
                            'gradetag',
                            g.verdict === 'hold' ? 'hold' : g.verdict && 'pass',
                          )}
                        >
                          <i className="gd" />
                          {g.grade}
                        </span>
                      ))}
                    </div>

                    {charged && <div className="bhint mt-2">{charged}</div>}
                    <div className="bhint mt-0.5">
                      {batchHint(qc)} · tap to log per-grade results
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tests.length > 0 && (
        <>
          <div className="msec">
            <b>Recent verdicts</b>
            <div className="ln" />
          </div>
          <div className="panel">
            {tests.slice(0, 12).map((test) => (
              <div key={test.id} className="mlog">
                <div className="mlog-h">
                  <span>
                    <BatchRef>{test.batch_no ?? '--'}</BatchRef>{' '}
                    <span className={cn('gradetag', test.verdict === 'pass' ? 'pass' : 'hold')}>
                      <i className="gd" />
                      {test.grade} {test.verdict}
                    </span>
                  </span>
                  <span className="muted text-[11px]">{dayMonth(test.tested_at)}</span>
                </div>
                {((test.params?.length ?? 0) > 0 || test.attachment_url) && (
                  <div className="mlog-b">
                    {test.params?.map((p) => (
                      <span key={p.name}>
                        <b>{p.name}</b> {p.value}
                        {p.unit ?? ''}{' '}
                      </span>
                    ))}
                    {test.attachment_url && (
                      <a
                        href={test.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--elec)' }}
                      >
                        report ✓
                      </a>
                    )}
                  </div>
                )}

                {/* Two-step, and the consequence spelled out beside the armed
                    button rather than left to the toast afterwards: what this
                    moves is stock in the yard, which is the part somebody
                    reading a list of verdicts is least likely to have in mind. */}
                {mayRemove &&
                  (confirming === test.id ? (
                    <>
                      <div className="hint mt-1.5">
                        Removing this puts the stock it released back where the tests that remain
                        leave it — the verdict before this one, or awaiting the lab if this was the
                        only one.
                      </div>
                      <div className="mt-1.5 flex gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={removing === test.id}
                          onClick={() => void remove(test)}
                        >
                          Yes, remove it
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1.5"
                      onClick={() => setConfirming(test.id)}
                    >
                      Remove
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* The batch: which of its grades have been tested, and which have not. */}
      <BottomSheet
        open={Boolean(target) && !draft}
        title={target ? `Batch ${target.ref}` : ''}
        subtitle={
          target
            ? [target.formulation, chargedText(target)]
                .filter(Boolean)
                .concat('Each grade is tested separately — tap a grade to log its own parameters and verdict.')
                .join(' · ')
            : undefined
        }
        led="var(--led-brand)"
        onClose={() => setTarget(null)}
        footer={
          <Button variant="ghost" onClick={() => setTarget(null)}>
            Close
          </Button>
        }
      >
        {target &&
          openGrades?.grades.map((status) => (
            <button
              key={status.grade}
              type="button"
              className="qcrow"
              onClick={() => openGrade(target, status)}
            >
              <QualityChip quality={status.grade} className="min-w-[78px] text-center" />
              <span className="flex-1">
                {status.test ? (
                  <>
                    <b style={{ color: status.verdict === 'hold' ? 'var(--err)' : 'var(--ok)' }}>
                      {status.verdict === 'hold' ? 'HOLD' : 'Passed'}
                    </b>
                    <span className="muted">
                      {' · '}
                      {dayMonth(status.test.tested_at)} · {readings(status.test)}
                    </span>
                  </>
                ) : (
                  <span className="muted">Untested</span>
                )}
              </span>
              <span className="chev">›</span>
            </button>
          ))}
      </BottomSheet>

      {/* One grade of that batch: its readings, its verdict, its report. */}
      <BottomSheet
        open={Boolean(draft)}
        title={
          draft
            ? draft.pool
              ? `${draft.pool.pool.display_label} · sample ${draft.pool.slot.slot}`
              : draft.moulded
                ? draft.moulded.kind === 'lot'
                  ? // Both halves of the key, in the order they are keyed: the
                    // shift, then what was made on it.
                    `${draft.moulded.batch_no ?? draft.moulded.display_label} · ${draft.grade}`
                  : `${draft.moulded.display_label} · moulded`
                : `Batch ${draft.batch?.ref} · ${draft.grade}`
            : ''
        }
        subtitle={
          draft
            ? draft.pool
              ? `Coarse · ${slotRange(draft.pool.slot)} · A sample records what the line was running to. It does not hold the pool.`
              : draft.moulded
                ? draft.moulded.kind === 'lot'
                  ? `${draft.grade} · A verdict here releases or stops this lot alone — the shift that made it.`
                  : `${draft.grade} · A verdict here releases or stops every pack of this product — it is not held to one batch.`
                : [draft.batch?.formulation, 'Log this grade’s test parameters, then mark Pass or Hold.']
                    .filter(Boolean)
                    .join(' · ')
            : undefined
        }
        led="var(--led-brand)"
        /* Disarmed on the way out, so the same verdict is not still one tap from
           being deleted in the list of recent ones behind this sheet. */
        onClose={closeDraft}
        footer={
          <>
            <Button variant="ghost" onClick={closeDraft}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save result
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <datalist id="qc-names">
              {QC_PARAM_SUGGEST.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {/*
              Which batch of compound was moulded, where anybody knows. Typed
              rather than picked, because a moulded stock group is keyed on the
              product and its pack and spans however many batches were boxed into
              it - there is no single batch on the row to offer.

              Optional, and usually blank: a press run records no batch number at
              all. It was required once, which meant a product could never be
              passed and so could never be dispatched. What releases the stock is
              the product on the card above; this is a note on the sample.
            */}
            {/*
              A sleeve or loop lot is the other case: the verdict is addressed by
              the shift it was made on and the product together, both of which
              are on the row, so there is nothing to type and nothing that may be
              typed. Shown read-only rather than hidden, because what the bench is
              about to sign against is exactly the thing worth showing - and both
              halves are named, because `03/Aug/26-day` alone is a shift two
              benches worked.
            */}
            {draft.moulded?.kind === 'lot' ? (
              <Readout
                label="Lot"
                value={`${draft.batchNo || draft.moulded.batch_no || draft.moulded.display_label} · ${draft.grade}`}
                valueColor="var(--brand)"
                className="mb-3.5"
              />
            ) : (
              draft.moulded && (
                <TextField
                  label="Batch moulded"
                  note="optional — the compound batch, if the sample’s label carries one"
                  value={draft.batchNo}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, batchNo: e.target.value.toUpperCase() } : d))
                  }
                />
              )
            )}

            <SheetLabel>
              Test readings <span className="muted normal-case tracking-normal">— for this grade</span>
            </SheetLabel>
            {draft.params.length ? (
              draft.params.map((param, at) => (
                <div key={`${param.name}-${at}`} className="weighrow mb-2">
                  <span>
                    <b>{param.name}</b> · {param.value}
                    {param.unit ? ` ${param.unit}` : ''}
                  </span>
                  <button
                    type="button"
                    className="wdel"
                    aria-label={`Remove ${param.name}`}
                    onClick={() => removeParam(at)}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="hint my-1">No readings yet. Add each test parameter and its value.</div>
            )}

            <FieldRow className="mt-1.5 items-stretch">
              <TextField
                label="Parameter"
                list="qc-names"
                autoComplete="off"
                placeholder="e.g. Mooney viscosity"
                value={entry.name}
                onChange={(e) => setEntry({ ...entry, name: e.target.value })}
                fieldClassName="!mb-0 flex-[1.3]"
              />
              <TextField
                label="Value"
                inputMode="decimal"
                placeholder="0"
                value={entry.value}
                onChange={(e) => setEntry({ ...entry, value: e.target.value })}
                fieldClassName="!mb-0"
              />
              <TextField
                label="Unit"
                autoComplete="off"
                placeholder="opt."
                value={entry.unit}
                onChange={(e) => setEntry({ ...entry, unit: e.target.value })}
                fieldClassName="!mb-0 flex-[.7]"
              />
              <Button variant="elec" className="flex-none self-end" onClick={addParam}>
                + Add
              </Button>
            </FieldRow>

            <SheetLabel className="mt-4">Verdict</SheetLabel>
            <div className="mb-1.5 flex gap-2">
              <Pick
                className="flex-1"
                selected={draft.verdict !== 'hold'}
                onClick={() => setDraft({ ...draft, verdict: 'pass' })}
                title="Pass"
                sub="fit for dispatch"
              />
              <Pick
                className="flex-1"
                selected={draft.verdict === 'hold'}
                onClick={() => setDraft({ ...draft, verdict: 'hold' })}
                title="Hold"
                sub="unfit — warn dispatch"
              />
            </div>

            <FieldRow className="mt-2.5">
              <TextField
                label="Tested by"
                autoComplete="off"
                placeholder="QC name"
                value={draft.testedBy}
                onChange={(e) => setDraft({ ...draft, testedBy: e.target.value })}
              />
              {/*
                The day the sample was taken, bounded to this slot. The server
                works out which of the three slots a sample belongs to from
                this date and nothing else, so a date outside the range would
                file it against a different sample point - or none at all.
              */}
              {draft.pool && (
                <TextField
                  label="Sampled on"
                  type="date"
                  note={slotRange(draft.pool.slot)}
                  min={draft.pool.slot.from}
                  max={draft.pool.slot.to}
                  value={draft.sampledOn}
                  onChange={(e) => setDraft({ ...draft, sampledOn: e.target.value })}
                />
              )}
            </FieldRow>

            <TextAreaField
              label="Notes"
              note="opt."
              rows={2}
              placeholder="observations / reason for hold"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />

            <SheetLabel className="mt-1.5">
              Lab report <span className="muted normal-case tracking-normal">opt. — photo or PDF</span>
            </SheetLabel>
            {draft.file ? (
              <div className="weighrow">
                <span>
                  {draft.file.type.startsWith('image') && (
                    <img
                      src={draft.file.dataUrl}
                      alt=""
                      className="mr-2 inline-block h-8 w-8 rounded-md object-cover align-middle"
                    />
                  )}
                  {draft.file.name} <small className="muted">new</small>
                </span>
                <button
                  type="button"
                  className="wdel"
                  aria-label="Remove the report"
                  onClick={() => setDraft({ ...draft, file: null })}
                >
                  ✕
                </button>
              </div>
            ) : (
              draft.attachmentUrl && (
                <div className="weighrow">
                  <span>
                    Report:{' '}
                    <a
                      href={draft.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--elec)' }}
                    >
                      view
                    </a>{' '}
                    <small className="muted">{draft.attachmentName}</small>
                  </span>
                </div>
              )
            )}
            <label className="btn ghost block mt-1.5 cursor-pointer">
              {draft.file || draft.attachmentUrl ? 'Replace report' : 'Attach photo / PDF'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={pickFile}
              />
            </label>

            <div className="hint mt-2">
              {draft.pool
                ? 'A hold stops the whole period — the pool cannot be dispatched until a later sample passes. An unsampled pool still sells.'
                : 'A hold does not stop a dispatch — it flags the batch so whoever loads it decides deliberately.'}
            </div>

            {/*
              Taking the verdict standing here off the record.

              Only where there is one, and only for the back office - the bench
              corrects itself by saving again, which is what the button in the
              footer does and what tests being append-only means. This is the
              other case: a verdict filed against the wrong grade or the wrong
              sample point, which every re-test misses because each one lands on
              a different key. Two-step, and the consequence is spelled out on
              the armed control rather than left to the toast, because what this
              moves is stock in the yard.
            */}
            {mayRemove && draft.test && (
              <>
                <SheetLabel className="mt-4">This verdict</SheetLabel>
                <div className="hint mb-1.5">
                  {[
                    draft.test.verdict === 'hold' ? 'Held' : 'Passed',
                    dayMonth(draft.test.tested_at),
                    draft.test.tested_by ?? draft.test.tester,
                    readings(draft.test),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  . Saving above files a re-test beside it; removing it takes it off the record
                  altogether.
                </div>
                {confirming === draft.test.id ? (
                  <>
                    <div className="hint" style={{ color: 'var(--warn)' }}>
                      Removing this puts the stock it released back where the tests that remain
                      leave it — the verdict before this one, or awaiting the lab if this was the
                      only one.
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={removing === draft.test.id}
                        onClick={() => void removeFromSheet(draft.test as StandingTest)}
                      >
                        Yes, remove it
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(draft.test?.id ?? null)}
                  >
                    Remove this verdict
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default QualityPage;
