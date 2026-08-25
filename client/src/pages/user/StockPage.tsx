import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { requestRefresh } from '@/features/ui/uiSlice';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import {
  Badge,
  Button,
  PageLoader,
  QualityChip,
  ViewHead,
  gradeClass,
} from '@/components/ui';
import { NewDispatchSheet, type DispatchableStock } from '@/features/dispatch/NewDispatchSheet';
import { ADMIN_ROLES, DELETE_ROLES, DISPATCH_ROLES, UNIT_NOUN, counted } from '@/config/constants';
import { SapStockPanel } from '@/features/stock/SapStockPanel';
import { useToast } from '@/hooks/useToast';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { cn } from '@/utils/cn';
import { dayMonth } from '@/utils/date';
import { kg as asKg } from '@/utils/format';
import type {
  DispatchGrade,
  QcStatus,
  StockGroup,
  StockKind,
  StockLabTest,
  StockPool,
  StockSummaryRow,
  StockUnit,
  Verdict,
} from '@/types/models';

/**
 * The Stock view - everything packed and standing in the plant, and what may
 * leave it.
 *
 * One route, two screens, because a manager and a supervisor are not being
 * shown the same thing with a field hidden - they are calling different
 * endpoints. `/stock` carries what was packed, what has gone out, what is left
 * and who signed the verdict off; `/stock/summary` carries the label, the grade,
 * what is there, what it weighs and the lab's verdict, and is built by its own
 * serializer on the server. A supervisor asking for `/stock` is refused at the
 * route, so there is nothing here that depends on this component being careful.
 *
 * The two responses are normalised into one card shape below rather than
 * rendered by two near-identical blocks. The manager's card carries two extra
 * lines - what was packed against what has gone, and who released it - and those
 * are the only differences, because they are the only fields the supervisor's
 * response does not have.
 *
 * Three kinds of stock, because there are three ways this plant makes something
 * it can sell:
 *
 *   reclaim  one card per batch and grade, with the lab's verdict on it.
 *   coarse   not batch-identified - the line runs for a shift, not for a batch,
 *            and the volumes are too large to name a pallet by - so it is pooled
 *            into ten-day thirds of the month, AUG-H1 through AUG-H3.
 *   moulded  what the presses made, one card per product and pack, counted in
 *            pieces rather than sacks.
 *
 * Nothing is hidden. A group the lab has not passed stays on the list with the
 * reason beside it and its Dispatch button disabled rather than absent - the
 * floor needs to know the stock exists and why it cannot go anywhere, and a
 * missing button is a question rather than an answer. A group that has gone out
 * entirely stays too, for the same reason: a pallet somebody is looking for and
 * cannot find on the screen has not been told it is empty, they have been told
 * nothing.
 *
 * The yard dispatches, and so does the back office - see DISPATCH_ROLES. The
 * vehicle is loaded here and the supervisor standing at it is the person who
 * knows what went on it, so the document is raised where the work happens. The
 * form is the same one either account gets: the customer, the stock, the price
 * per quality and the loading job.
 *
 * That means a supervisor can read the customer list and the rate against each
 * grade, because a dispatch cannot be filled in otherwise. It is a real
 * widening and it was chosen rather than stumbled into.
 *
 * One thing did not move with it, and it is still gated here: the
 * packed-against-dispatched ledger. A supervisor's cards come from
 * /stock/summary, which says what is there and what the lab said and nothing
 * about what has been sold off it. The route refuses them /stock outright, so
 * this is not a matter of the screen being careful.
 *
 * The QC verdict is not settable from this screen at all. It is the lab's, and
 * it arrives here by polling and by refreshTick when a test is filed.
 *
 * A control that cannot be used is drawn dead rather than hidden - for stock
 * the lab has stopped, and for an account that may not dispatch at all. A
 * missing button is a question - is this screen broken, am I the wrong account,
 * has the stock not arrived - and answering it costs a walk to the office; a
 * button that is visibly dead and says why has already answered it.
 */

const QC_TONE: Record<QcStatus, 'ok' | 'down' | 'paused'> = {
  pass: 'ok',
  fail: 'down',
  pending: 'paused',
};

const QC_LABEL: Record<QcStatus, string> = {
  pass: 'QC passed',
  fail: 'QC failed',
  pending: 'QC pending',
};

/** What each band means, under its heading, once per page rather than per card. */
const QC_HINT: Record<QcStatus, string> = {
  pass: 'released by the lab — this is what can go on a vehicle',
  pending: 'packed and sent to the lab, no result yet',
  fail: 'the lab said no — still here until it is reworked or written off',
};

/** The verdict filter and the band order, in the order the yard cares about. */
const QC_ORDER: QcStatus[] = ['pass', 'pending', 'fail'];

const KIND_NOUN: Record<StockKind, string> = {
  batch: 'batch',
  pool: 'coarse pool',
  product: 'moulded',
  // A sleeve or loop shift. Named "lot" rather than "moulded" beside a press's
  // groups, because the difference between the two is exactly what somebody
  // reading this column needs: one row is a shift the lab can answer on, the
  // other is every pack of a product pooled together.
  lot: 'lot',
};

/**
 * Why this group cannot go on a vehicle, in the words to say it in.
 *
 * Short, because it goes on a disabled button's tooltip as well as under the
 * badge - the same sentence in both places, so tapping a control that will not
 * move and reading the card tell you the same thing.
 */
const blockedReason = (card: { qc: QcStatus; available: number }): string | null => {
  if (card.qc === 'fail') return 'QC failed — cannot be dispatched';
  if (card.qc === 'pending') return 'QC pending — the lab has not released it';
  if (card.available <= 0) return 'Nothing left in this group';
  return null;
};

/**
 * Why this group cannot be cleared off the list, in the words to say it in.
 *
 * The server's two refusals, said before the tap rather than after it, and each
 * naming where the work actually is. A group is the running total of the packing
 * filed against one label and nothing records which runs fed it, so a full one
 * cannot go without stranding every run that says it packed into it, and the
 * only thing that can take packing back off a run now is the back office. A
 * group with a dispatch behind it is refused for good: the ledger says those
 * sacks left, and the row is the record of it.
 */
const deleteBlock = (card: { available: number; dispatched: number | null }): string | null => {
  if (card.available > 0) return 'Still holding stock — the office has to clear it first';
  if ((card.dispatched ?? 0) > 0) return 'Stock has gone out of this group — the row is the record of it';
  return null;
};

/**
 * Why this account cannot press the button even when the stock is fine.
 *
 * A different kind of answer from the ones above - it is about who is asking
 * rather than about the goods - so it is only given once the stock itself has
 * nothing wrong with it. Telling somebody standing in front of a failed pallet
 * that they are the wrong account would be true and useless; what they need to
 * know is that the lab stopped it.
 *
 * The yard and the office both dispatch now, so this is what a worker or a lab
 * account is told - the two that still cannot.
 */
const NOT_YOURS = 'Dispatches are raised by the yard or the back office';

/** The reason a Dispatch button will not move, for this account and this card. */
const dispatchBlock = (card: { qc: QcStatus; available: number }, mayDispatch: boolean) =>
  blockedReason(card) ?? (mayDispatch ? null : NOT_YOURS);

/**
 * One card, from whichever response it came off. `ledger` and `signed` are the
 * back office's extra lines and are null on the supervisor's side - not blanked
 * there, absent, because the fields they are built from are not in that response
 * at all.
 */
interface YardCard {
  id: string;
  /**
   * The group's label as the yard stores it - a key, and what the server names
   * when it refuses a dispatch. Not what the card prints; see `ref`.
   */
  label: string;
  /**
   * What the card prints in its reference slot: the batch number where the goods
   * carry one, and the label where they do not. See refOf().
   */
  ref: string;
  /**
   * The chip beside it: the grade on reclaim and coarse, the product on moulded
   * goods.
   *
   * One field for both because the card is asking one question - what is this? -
   * and the answer differs by kind rather than by there being two questions. It
   * is also what the grade filter and the tallies key on, which is why a moulded
   * card's product belongs in it rather than beside it.
   */
  grade: string | null;
  kindLabel: StockKind;
  unit: StockUnit;
  available: number;
  packs: number | null;
  packSize: number | null;
  weightKg: number | null;
  packedFrom: string | null;
  packedTo: string | null;
  qc: QcStatus;
  kind: string | null;
  ledger: string | null;
  signed: string | null;
  /**
   * The lab test the verdict was made on, where the server found one.
   *
   * Null on the supervisor's card, and null on the back office's for a group
   * nobody has tested - which is a real state, not a gap. See `test` in the
   * rendering below for what each of the two nulls is allowed to say.
   */
  test: StockLabTest | null;
  /**
   * How far through its three samples a coarse pool is, and whether any of
   * them came back a hold. Null on a batch or a moulded group, which are
   * certified as a lot rather than sampled across a period.
   */
  samples: { taken: number; total: number; anyHold: boolean } | null;
  /**
   * How much has ever left this group on a dispatch.
   *
   * Only on the back office's card - it comes off the manager's read, which is
   * the one that carries the packed-against-dispatched ledger at all. Null on
   * the floor's, and that null is "not told", not "none": nothing on the
   * supervisor's side asks the question, and the delete it decides is the
   * office's anyway.
   *
   * Its own field rather than being read back out of `ledger`, which is a
   * sentence for a person. What this decides is whether a group may be deleted,
   * and that is not a thing to work out by parsing prose.
   */
  dispatched: number | null;
}

/**
 * A lab verdict as a stock status - the same mapping the server makes, because
 * the card has to be able to notice when the two disagree.
 *
 * The yard has no third state between passed and blocked, so a hold reads as a
 * fail here exactly as it does in stock.service.js. Anything else answers null
 * and compares equal to nothing, which is what keeps an unrecognised verdict
 * from being drawn as an override.
 */
const verdictStatus = (verdict?: Verdict | null): QcStatus | null =>
  verdict === 'pass' ? 'pass' : verdict === 'hold' ? 'fail' : null;

const samplesOf = (pool?: StockPool): YardCard['samples'] =>
  pool ? { taken: pool.samples_taken, total: pool.samples_total, anyHold: pool.any_hold } : null;

/** "packed 3 Aug", or the span where a group was filled over several days. */
const packedSpan = (from?: string | null, to?: string | null) => {
  if (!from && !to) return null;
  if (!from || !to || from === to) return `packed ${dayMonth(from ?? to)}`;
  return `packed ${dayMonth(from)} → ${dayMonth(to)}`;
};

/**
 * The second line of a card: what kind of stock it is, and the pack a moulded
 * group is boxed in.
 *
 * A product with no pack size set reads "boxed loose", which is a real state
 * rather than an error - the presses run whether or not the back office has
 * filled the field in - and saying so on the card is what gets it filled in.
 */
const kindLine = (row: {
  kind: StockKind;
  pack_size?: number | null;
  period_start?: string | null;
  period_end?: string | null;
}) =>
  [
    KIND_NOUN[row.kind],
    row.kind === 'product'
      ? row.pack_size
        ? `${row.pack_size} to a pack`
        : 'boxed loose — no pack size set'
      : null,
    row.period_start ? `${row.period_start} → ${row.period_end}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * What the card is called: the batch number where the goods carry one, and the
 * group's label where they do not.
 *
 * A lot reads `03/Aug/26-day` with `Sleve` on the chip, and a batch group reads
 * `B1041` with `Fine` on the chip - the number in the reference slot and what
 * was made beside it, which is the shape every other reference in this app has.
 * A coarse pool and a press's product group are not batch-identified and keep
 * their label, `AUG-H1` and `LOOP-50`, which are already the name of the goods
 * rather than a key that happens to be readable.
 *
 * The lot is the one that could not be done any other way. Its label is
 * `<product>-<shift>` and the two benches working one shift produce two of them,
 * so a card showing the label alone would read as one string carrying two facts
 * - which is exactly the arrangement the batch number was taken apart to end.
 */
const refOf = (row: { batch_no?: string | null; display_label?: string; label?: string }) =>
  row.batch_no || row.display_label || row.label || '';

const fromGroup = (row: StockGroup, pool?: StockPool): YardCard => ({
  id: row.id,
  label: row.display_label,
  ref: refOf(row),
  grade: row.quality,
  kindLabel: row.kind,
  unit: row.unit,
  available: row.available_qty,
  packs: row.available_packs ?? null,
  packSize: row.pack_size ?? null,
  weightKg: row.available_kg ?? null,
  packedFrom: row.first_packed_on ?? null,
  packedTo: row.last_packed_on ?? null,
  qc: row.qc_status,
  kind: kindLine(row),
  ledger: `${counted(row.packed_qty, row.unit)} packed · ${row.dispatched_qty} dispatched`,
  signed: signature(row),
  test: row.lab_test ?? null,
  samples: samplesOf(pool),
  dispatched: Number(row.dispatched_qty ?? 0),
});

/**
 * Who put this group on its verdict and when.
 *
 * Only on the back office's card. The floor needs the verdict to load a lorry
 * and does not need the name against it, and a colleague's name is not something
 * to put on a screen that does not need it.
 *
 * `lab` and `manual` are said differently on purpose. One has a test row behind
 * it and one is somebody deciding, and they are the two answers to the question
 * anybody would later be asking this line to settle.
 */
function signature(row: StockGroup): string | null {
  if (!row.qc_at && !row.qc_by) return null;
  const who = row.qc_by ?? 'unknown';
  const when = row.qc_at ? dayMonth(row.qc_at.slice(0, 10)) : null;
  const how = row.qc_source === 'manual' ? 'set by' : 'released by';
  return `${how} ${who}${when ? ` · ${when}` : ''}`;
}

const fromSummary = (row: StockSummaryRow, pool?: StockPool): YardCard => ({
  id: row.id,
  // Already display form on this side - the server sends it through
  // displayLabel() - so the same two fields come off one.
  label: row.label,
  ref: refOf(row),
  grade: row.quality,
  kindLabel: row.kind,
  unit: row.unit,
  available: row.available_qty,
  packs: row.available_packs ?? null,
  packSize: row.pack_size ?? null,
  weightKg: row.available_kg ?? null,
  packedFrom: row.first_packed_on ?? null,
  packedTo: row.last_packed_on ?? null,
  qc: row.qc_status,
  kind: kindLine(row),
  ledger: null,
  signed: null,
  /*
   * Absent on this side rather than blanked. /stock/summary does not carry it -
   * the readings arrive with the tester's name on them, and who tested a lot is
   * the same kind of record as who released it, which the floor's row has never
   * carried. The verdict itself is the operative fact for loading a lorry and
   * that is on both rows.
   */
  test: null,
  samples: samplesOf(pool),
  dispatched: null,
});

/** "tested 2 Aug · R. Kumar", or whichever half of it was recorded. */
const testedLine = (test: StockLabTest) =>
  [test.tested_at ? `tested ${dayMonth(test.tested_at.slice(0, 10))}` : null, test.tested_by]
    .filter(Boolean)
    .join(' · ') || 'tested — date not recorded';

/**
 * When the card's verdict and the test under it do not say the same thing, and
 * what that means.
 *
 * Three ways it happens and they are three different situations, so they are
 * three different sentences. Two are the back office overriding the bench, which
 * is legitimate and is what PATCH /stock/:id/qc exists for - but a card that
 * showed the reading without saying it had been overruled would be worse than
 * one that showed no reading at all, because it would look like the lab had
 * cleared goods it stopped.
 *
 * The third is neither: a verdict the yard has not picked up. That is a group
 * whose test was filed while applyLabVerdict() could not reach it, and it is
 * fixed by packing into the group again or by `npm run stock:qc-sync` - so it
 * says so rather than reading as somebody's decision.
 */
const overrideNote = (card: YardCard): string | null => {
  const said = verdictStatus(card.test?.verdict);
  if (!said || said === card.qc) return null;
  if (card.qc === 'pending') return 'the yard has not picked this verdict up yet — run the QC sync';
  return said === 'fail'
    ? 'the lab held this — it has been released by hand since'
    : 'the lab passed this — it has been held by hand since';
};

/** "2 of 3 sampled", and whether the lab flagged any of them. */
const sampleHint = (samples: NonNullable<YardCard['samples']>) => {
  const counted = `${samples.taken} of ${samples.total} sampled`;
  return samples.anyHold ? `${counted} · a hold on record` : counted;
};

/**
 * What a set of cards comes to: how many groups, how much of each unit, and
 * what it weighs.
 *
 * Sacks and pieces are counted apart and never summed together. "412 held"
 * reading as sacks when half of it is loops is worse than no total at all, and
 * kg is the only figure that legitimately covers both - which is also what a
 * lorry is loaded by.
 */
function tally(cards: YardCard[]) {
  return cards.reduce(
    (sum, card) => ({
      groups: sum.groups + 1,
      sacks: sum.sacks + (card.unit === 'sacks' ? card.available : 0),
      pieces: sum.pieces + (card.unit === 'pieces' ? card.available : 0),
      kg: sum.kg + (card.weightKg ?? 0),
    }),
    { groups: 0, sacks: 0, pieces: 0, kg: 0 },
  );
}

/** A tally as one line: "3 groups · 60 sacks · 1,200 pieces · 3,400 kg". */
const tallyLine = (t: ReturnType<typeof tally>) =>
  [
    `${t.groups} ${t.groups === 1 ? 'group' : 'groups'}`,
    t.sacks ? counted(t.sacks, 'sacks') : null,
    t.pieces ? counted(t.pieces, 'pieces') : null,
    t.kg ? asKg(t.kg) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The same tally without the group count, for the page heading - which has just
 * said how many groups there are and does not need to say it twice.
 *
 * "nothing ready" rather than an empty string, because a heading that simply
 * stops reads as a figure that failed to load, and "no stock has passed QC" is
 * one of the more important things this page can be saying.
 */
const readyLine = (t: ReturnType<typeof tally>) => {
  const parts = [
    t.sacks ? counted(t.sacks, 'sacks') : null,
    t.pieces ? counted(t.pieces, 'pieces') : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} ready` : 'nothing ready';
};

export function StockPage() {
  const notify = useToast();
  const dispatch = useAppDispatch();
  /**
   * Whether the yard this app used to keep for itself is on screen.
   *
   * Off by default and off for the floor entirely. Stock comes from SAP now,
   * so what is under this is a frozen ledger: the packing entry is off the
   * tablets, nothing is filed into it any more, and a crew reading it would be
   * reading a photograph of the yard as it stood the day the bench stopped.
   *
   * Kept reachable at all for one reason - the dispatch documents are drawn
   * against these groups, and a dispatch already in flight has to be able to
   * be finished. It goes when dispatch does.
   */
  const [showLegacy, setShowLegacy] = useState(false);
  const role = useAppSelector((s) => s.auth.user?.role);
  /*
   * Two different questions, and they are no longer the same one.
   *
   * `isManager` is the back office - it decides which yard read this account
   * gets, the full ledger or the floor's summary. `mayDispatch` is who can
   * raise a document, which is now the yard as well.
   */
  const isManager = Boolean(role && ADMIN_ROLES.includes(role));
  const mayDispatch = Boolean(role && DISPATCH_ROLES.includes(role));
  /*
   * And a third, narrower than either: who may clear a group off the yard.
   *
   * The admin account alone - see DELETE_ROLES. A manager keeps the whole
   * ledger read and the QC verdict, both of which can be taken back; what they
   * no longer have is the row delete, which nothing in this app undoes. It is
   * still only ever offered on a card the manager's read produced, because
   * `dispatched` is what decides whether a group may go at all and the floor's
   * summary does not carry it.
   */
  const mayDelete = Boolean(role && DELETE_ROLES.includes(role));
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [summary, setSummary] = useState<StockSummaryRow[]>([]);
  /** The coarse pools by group id, for the sampling line on their cards. */
  const [pools, setPools] = useState<Map<string, StockPool>>(new Map());
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState('');
  const [qc, setQc] = useState('');
  const [dispatching, setDispatching] = useState(false);
  /** The group the sheet should open on, when it was opened from a card. */
  const [dispatchFrom, setDispatchFrom] = useState<string | null>(null);
  /**
   * Which emptied group is one tap from being cleared off the list, and which
   * is going. One id, so arming a second disarms the first - the same two-step
   * every destructive control in the app uses.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openDispatch = useCallback(
    (stockGroupId: string | null) => {
      // The buttons are disabled for an account that may not dispatch and the
      // sheet is not mounted for one either, so this cannot normally be
      // reached. It is here because "the sheet only opens for a dispatcher"
      // should be true of the function that opens it, not only of the two
      // places that call it.
      if (!mayDispatch) return;
      setDispatchFrom(stockGroupId);
      setDispatching(true);
    },
    [mayDispatch],
  );

  /**
   * Clear an emptied group off the yard's list.
   *
   * Optimistic only in the sense that the row goes as soon as the server says
   * it did - there is nothing to put back and nothing else on this page that
   * was reading it. The refresh tick goes out because the yard is also drawn on
   * the back office's Quality tab and counted into the lab's own lists.
   *
   * The server's refusals come through unchanged. Each names where the work
   * actually is - reverse the dispatch, or take the packing off on the Packing
   * tab - and rewording that to "could not delete" would throw away the only
   * useful half of the answer.
   */
  const removeGroup = async (card: YardCard) => {
    setDeleting(card.id);
    try {
      await stockService.remove(card.id);
      setGroups((prev) => prev.filter((g) => g.id !== card.id));
      setConfirming(null);
      notify(`${card.ref} cleared off the yard`, 'ok');
      dispatch(requestRefresh());
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setDeleting(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * The pools come alongside whichever yard read this account gets, so a
       * coarse card can say how far through its three samples the period is.
       * It is a separate call because the samples live with the lab's tests
       * rather than on the stock row - and it is allowed to fail on its own:
       * the yard is worth showing without the sampling progress on it.
       */
      const [, pools] = await Promise.all([
        isManager
          ? stockService.list({ limit: 200 }).then((res) => setGroups(res.rows))
          : stockService.summary({ limit: 200 }).then((res) => setSummary(res.rows)),
        stockService.pools({ limit: 60 }).then(
          (res) => res.rows,
          () => [] as StockPool[],
        ),
      ]);
      setPools(new Map(pools.map((pool) => [pool.id, pool])));
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [isManager, notify]);

  /*
   * On mount, whenever anything asks for a refresh, and whenever this screen is
   * looked at again.
   *
   * The middle one is what carries a lab verdict across: filing a test bumps
   * refreshTick, and passing a batch releases its stock group while a passing
   * sample lifts a pool off pending - so the yard is stale the instant the lab
   * saves, and would otherwise go on reading "QC pending" for stock that has
   * just been cleared.
   *
   * A delete in History bumps it for the same reason in the other direction.
   * Removing a run takes its packing back out of the group and takes the group
   * with it where the run was the only thing in it, so a tab left open on this
   * screen would go on drawing a card for stock that no longer exists.
   */
  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  /*
   * And on a timer while somebody is looking at it.
   *
   * The lab and the yard are different accounts on different screens - a lab
   * account cannot open this tab at all - so a verdict filed at the bench can
   * never reach this device through the app's own state, however carefully that
   * is wired. Polling is what closes the gap. Thirty seconds is short enough
   * that a released pool turns up while the crew is still standing at it, and
   * long enough that a tablet propped open all shift is not a load.
   */
  useRefreshOnFocus(load, { intervalMs: 30_000 });

  const cards = useMemo(
    () =>
      isManager
        ? groups.map((row) => fromGroup(row, pools.get(row.id)))
        : summary.map((row) => fromSummary(row, pools.get(row.id))),
    [isManager, groups, summary, pools],
  );

  /*
   * Filtered here rather than refetched. The whole yard is a couple of hundred
   * rows at most, and a round trip per tap on a tablet over the plant's wifi is
   * slower than the crew can read.
   */
  const visible = useMemo(
    () =>
      cards
        .filter((c) => (!grade || c.grade === grade) && (!qc || c.qc === qc))
        /*
         * Spent groups last, live stock first.
         *
         * A group that has gone out entirely is listed rather than hidden - a
         * pallet somebody is looking for and cannot find on the screen is not
         * answered by the row being absent. But it is finished business, and a
         * month of it above today's stock would bury the thing the crew opened
         * the tab for. So it keeps its place in the record and loses its place
         * in the queue.
         */
        .sort((a, b) => Number(b.available > 0) - Number(a.available > 0)),
    [cards, grade, qc],
  );

  /* The grades and products actually in the yard, and how many groups of each -
     offering one with nothing under it is a dead option on a tablet. */
  const gradeCounts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const c of cards) if (c.grade) tally[c.grade] = (tally[c.grade] ?? 0) + 1;
    return tally;
  }, [cards]);

  const grades = useMemo<string[]>(
    () => Object.keys(gradeCounts).sort((a, b) => a.localeCompare(b)),
    [gradeCounts],
  );

  const qcCounts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const c of cards) tally[c.qc] = (tally[c.qc] ?? 0) + 1;
    return tally;
  }, [cards]);

  /* A filter left on a value the yard no longer holds shows an empty screen
     with no clue why, so it falls back to all rather than stranding the crew. */
  useEffect(() => {
    if (grade && !grades.includes(grade)) setGrade('');
  }, [grade, grades]);
  useEffect(() => {
    if (qc && !qcCounts[qc]) setQc('');
  }, [qc, qcCounts]);

  /**
   * The whole yard by verdict, whatever the filters are set to.
   *
   * Deliberately built off every card rather than the visible ones. It is the
   * state of the plant, and a summary that moved when a filter was tapped would
   * be a second, quieter filter - the counts here would disagree with the ones
   * on the chips and neither would be wrong. "How much is stuck in pending" is
   * the question this exists for, and it is not a question about the filter.
   */
  const standing = useMemo(() => {
    const out = {} as Record<QcStatus, ReturnType<typeof tally>>;
    for (const status of QC_ORDER) out[status] = tally(cards.filter((c) => c.qc === status));
    return out;
  }, [cards]);

  /**
   * The cards banded by the lab's verdict: what can go out, what is waiting,
   * what is stopped.
   *
   * Grouped rather than merely coloured, because the question the yard opens
   * this tab with is "what can go on the lorry" and that is a set, not a
   * property to be read off each card in turn. Ready first - it is the answer
   * most of the time - then the two kinds of no, which are different problems:
   * pending is somebody to chase, failed is stock to write off or rework.
   *
   * A band with nothing in it is dropped rather than shown empty. An empty
   * "QC failed" heading reads as a category that exists today, and the point of
   * these headings is that the ones present are the ones with work under them.
   */
  const bands = useMemo(
    () =>
      QC_ORDER.map((status) => ({
        status,
        rows: visible.filter((c) => c.qc === status),
      })).filter((band) => band.rows.length),
    [visible],
  );

  /*
   * What the dispatch sheet is offered. Built off the same normalised cards, so
   * the sheet can never be handed a group the screen is not showing - and it is
   * handed every group rather than the passed ones, because the sheet is what
   * decides selectability and it says why about the rest.
   */
  const dispatchable: DispatchableStock[] = useMemo(
    () =>
      cards.map((c) => ({
        id: c.id,
        display_label: c.label,
        quality: (c.grade ?? null) as DispatchGrade | null,
        unit: c.unit,
        available_qty: c.available,
        available_sacks: c.available,
        pack_size: c.packSize,
        qc_status: c.qc,
      })),
    [cards],
  );

  /*
   * Issuing a dispatch is the back office's - see the note at the top. A
   * supervisor gets the same yard without the buttons rather than a button that
   * fails: the customer list behind the form is refused to them at the route,
   * so offering it would only produce a 403 they can do nothing about.
   */
  const hasLoadable = dispatchable.some((row) => row.available_qty > 0 && row.qc_status === 'pass');
  const canDispatch = mayDispatch && hasLoadable;
  /** Why the header button is dead, when it is. Who first, then the stock. */
  const dispatchHint = !mayDispatch
    ? NOT_YOURS
    : hasLoadable
      ? undefined
      : 'Nothing has passed QC with stock left';

  const filtered = Boolean(grade || qc);

  if (loading && !cards.length) return <PageLoader label="Loading stock" />;

  const chip = (
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
      {/*
        The yard is SAP's answer now, and it is the whole page.

        The packing entry is off the tablets - the plant is too busy to keep a
        bagging bench up to date - so the groups this app kept for itself no
        longer grow. Showing both would put two answers to one question on one
        screen and leave the reader to work out which is the plant.
      */}
      <ViewHead meta="from SAP" />

      <SapStockPanel />

      {/*
        And the way back to the frozen ledger, for the office alone.

        Not on the floor at all: a crew reading it would be reading the yard as
        it stood the day the bagging bench stopped, and nothing on the rows
        themselves would say so. The office needs it while a dispatch drawn
        against those groups is still in flight, and not after.
      */}
      {mayDispatch && cards.length > 0 && (
        <button
          type="button"
          className="btn ghost block mt-2.5"
          onClick={() => setShowLegacy(!showLegacy)}
        >
          {showLegacy ? 'Hide' : 'Show'} the old yard ledger · {cards.length} groups
        </button>
      )}

      {showLegacy && (
        <>
          <div className="hint">
            Nothing has been filed into these since the packing entry came off the tablets.
            They are what the dispatch documents are drawn against, and they are not the
            yard — the panel above is. {filtered ? `${visible.length} of ${cards.length}` : cards.length}
            {' '}groups · {readyLine(standing.pass)}.
          </div>
          {/*
            What is standing in each verdict, before any of the cards.

            The bands below answer "which batch"; this answers "how much is
            stuck", which is the question a manager walks in with and which the
            card list makes you add up by eye. It does not move when a filter is
            tapped - see the note on `standing`.
          */}
          <div className="qcstat" role="group" aria-label="Stock by QC state">
            {QC_ORDER.map((status) => (
              <div key={status} className={cn('qcstat-cell', status, !standing[status].groups && 'nil')}>
                <Badge tone={QC_TONE[status]}>{QC_LABEL[status]}</Badge>
                <b>{tallyLine(standing[status])}</b>
              </div>
            ))}
          </div>

          {/* One grade in the yard is not something to filter by. */}
          {grades.length > 1 && (
            <div className="gradebar" role="group" aria-label="Filter by quality">
              {chip('All', cards.length, !grade, 'all-grades', () => setGrade(''))}
              {grades.map((g) =>
                chip(g, gradeCounts[g] ?? 0, grade === g, gradeClass(g) ?? '', () => setGrade(g)),
              )}
            </div>
          )}

          {/* The verdict filter only earns its row once the yard holds more
              than one verdict - otherwise every card is the same colour. */}
          {Object.keys(qcCounts).length > 1 && (
            <div className="gradebar" role="group" aria-label="Filter by QC state">
              {chip('All', cards.length, !qc, 'all-grades', () => setQc(''))}
              {QC_ORDER.filter((status) => qcCounts[status]).map((status) =>
                chip(QC_LABEL[status], qcCounts[status] ?? 0, qc === status, `qc-${status}`, () =>
                  setQc(status),
                ),
              )}
            </div>
          )}

          {/* The cards each dispatch their own group; this is for a vehicle
              loaded off several at once, which has no card to start from. On
              the yard's screen it is present and dead, saying who issues one -
              see the note at the top.

              The reason is printed beside the button rather than left on its
              tooltip. A disabled button is not focusable and a tablet has no
              hover, so a title alone is a control that is dead and mute on
              exactly the devices this app is used on. Said once here rather
              than on every card, because on a supervisor's screen it would
              otherwise be the same sentence twenty times over. */}
          <div className="mb-3 flex items-center justify-end gap-2.5">
            {dispatchHint && <small className="muted">{dispatchHint}</small>}
            <Button
              variant="ghost"
              onClick={() => openDispatch(null)}
              disabled={!canDispatch}
              title={dispatchHint}
            >
              Issue a dispatch ▸
            </Button>
          </div>

          {visible.length ? (
            bands.map((band) => (
              <section key={band.status}>
                {/* The heading carries the quantities as well as the count of
                    groups: "3 groups" is not an answer to how much can go out,
                    and that is what somebody is standing here to ask. */}
                <div className="msec">
                  <b>{QC_LABEL[band.status]}</b>
                  <span className="ct">{tallyLine(tally(band.rows))}</span>
                  <div className="ln" />
                </div>
                <p className="qcband-hint">{QC_HINT[band.status]}</p>
                <div className="stack">
                  {band.rows.map((c) => {
                    /*
                     * Two reasons, and they are printed in different places.
                     *
                     * What is wrong with the stock goes on the card, because it
                     * is a fact about the goods and it differs card to card.
                     * Who may issue a dispatch does not - it is the same
                     * sentence on every card on that account - so it goes once
                     * beside the header button and onto this button's label,
                     * where it is read only by whoever reaches for it.
                     */
                    const stockReason = blockedReason(c);
                    const reason = dispatchBlock(c, mayDispatch);
                    const override = overrideNote(c);
                    const loadable = mayDispatch && c.qc === 'pass' && c.available > 0;
                    return (
                      <article
                        key={c.id}
                        className={cn('scard', c.qc, c.available <= 0 && 'spent')}
                      >
                        <div className="top">
                          <div className="who">
                            {/* The reference, then what it is. A lot reads
                                `03/Aug/26-day` with `SLEVE` on the chip - the
                                shift and the product side by side, because
                                neither names the goods on its own. */}
                            <div className="row1">
                              <b>{c.ref}</b>
                              {c.grade && <QualityChip quality={c.grade} />}
                            </div>
                            {c.kind && <small>{c.kind}</small>}
                            {/* When it was packed and what it weighs - the two
                                things asked at the gate that a count alone
                                cannot answer. */}
                            <small>
                              {[packedSpan(c.packedFrom, c.packedTo), c.weightKg ? asKg(c.weightKg) : null]
                                .filter(Boolean)
                                .join(' · ') || 'packing date not recorded'}
                            </small>
                            {c.ledger && <small>{c.ledger}</small>}
                            {c.signed && <small>{c.signed}</small>}
                            {/* Coarse is sampled across its period rather
                                than certified as a lot, so the card says how
                                far through those three samples the pool is. */}
                            {c.samples && (
                              <small className={cn(c.samples.anyHold && 'warn')}>
                                {sampleHint(c.samples)}
                              </small>
                            )}
                          </div>
                          <div className="left">
                            <b>{c.available}</b>
                            <span>
                              {UNIT_NOUN[c.unit].many}
                              {/* A pack count beside the pieces, because the
                                  floor moves boxes and the order was in boxes. */}
                              {c.packs != null ? ` · ${c.packs} packs` : ''}
                            </span>
                          </div>
                        </div>

                        {/*
                          The reading the verdict was made on.

                          `qc_status` is a conclusion with nothing under it, and
                          until this was here the only way to read the sentence
                          behind it was to leave the yard and open the Quality
                          tab against the right batch and grade. The measured
                          values, the report and the name against them travel
                          with the goods now, on the card the goods are on.

                          Back office only, because the readings arrive with the
                          tester's name on them - see `test` on fromSummary().
                        */}
                        {c.test && (
                          <div className="lab">
                            <div className="lab-h">
                              <span
                                className={cn('gradetag', c.test.verdict === 'pass' ? 'pass' : 'hold')}
                              >
                                <i className="gd" />
                                lab {c.test.verdict === 'pass' ? 'pass' : 'hold'}
                              </span>
                              <span className="muted">{testedLine(c.test)}</span>
                            </div>

                            {/* The bench and the card disagreeing, said in
                                words - see overrideNote(). */}
                            {override && <div className="lab-warn">{override}</div>}

                            {/* What was actually measured, and the sheet it was
                                written on. A test filed with neither is still a
                                verdict, so both are optional and the row is
                                dropped when there is nothing in it rather than
                                drawn empty. */}
                            {((c.test.params?.length ?? 0) > 0 || c.test.attachment_url) && (
                              <div className="lab-b">
                                {c.test.params?.map((p) => (
                                  <span key={p.name}>
                                    <b>{p.name}</b> {p.value}
                                    {p.unit ?? ''}
                                  </span>
                                ))}
                                {c.test.attachment_url && (
                                  <a
                                    href={c.test.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {c.test.attachment_name || 'report'} ↗
                                  </a>
                                )}
                              </div>
                            )}

                            {c.test.remarks && <div className="lab-note">{c.test.remarks}</div>}
                          </div>
                        )}

                        <div className="foot">
                          <div>
                            <Badge tone={QC_TONE[c.qc]}>{QC_LABEL[c.qc]}</Badge>
                            {stockReason && <div className="why">{stockReason}</div>}
                          </div>
                          {/*
                            Disabled rather than absent.

                            A button that is not there is a question - is this
                            screen broken, am I the wrong account, is the stock
                            wrong - and it takes a phone call to answer. A button
                            that is visibly dead and says why on hover or tap has
                            already answered it. The server refuses the dispatch
                            regardless, so this is about telling somebody why,
                            not about enforcement.
                          */}
                          <div className="acts">
                            {/*
                              Clearing an emptied group off the list.

                              Only a group with nothing in it and nothing ever
                              out of it can actually go, and that is the whole of
                              what this deletes - see deleteBlock() for why each
                              of the other two is refused. But the button is
                              drawn on every group the admin account can see,
                              dead and saying why, rather than appearing on the
                              three rows it would work on. That is this page's
                              rule everywhere else - see the note at the top -
                              and it is the same argument: an absent Delete is a
                              question somebody answers with a walk to the
                              office, and a dead one that names the Packing tab
                              has already answered it.

                              The rule stops at who is asking, which is why this
                              is `mayDelete` and not a dead button for everyone
                              else. A manager is not going to be given a Delete
                              that can never move for them on any card in the
                              yard - that is not an answer, it is twenty rows of
                              furniture.
                            */}
                            {mayDelete &&
                              (() => {
                                const stopped = deleteBlock(c);
                                return (
                                  <Button
                                    variant={confirming === c.id ? 'danger' : 'ghost'}
                                    size="sm"
                                    loading={deleting === c.id}
                                    disabled={Boolean(stopped)}
                                    title={
                                      stopped ??
                                      'Nothing was ever made here and nothing ever left it — clear the row'
                                    }
                                    aria-label={
                                      stopped
                                        ? `${c.ref} — ${stopped}`
                                        : `Delete the empty stock group ${c.ref}`
                                    }
                                    onClick={() =>
                                      confirming === c.id
                                        ? void removeGroup(c)
                                        : setConfirming(c.id)
                                    }
                                  >
                                    {confirming === c.id ? 'Sure? Delete' : 'Delete'}
                                  </Button>
                                );
                              })()}
                            {/*
                              On every account, and dead on most of them. The
                              reason is on the tooltip for a pointer and printed
                              under the badge for a thumb - see the note at the
                              top on why this is shown at all rather than
                              hidden.
                            */}
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!loadable}
                              title={reason ?? undefined}
                              aria-label={
                                /* Both halves for a screen reader, which has no
                                   chip to read beside the number. */
                                loadable
                                  ? `Dispatch ${c.ref} ${c.grade ?? ''}`.trim()
                                  : `${c.ref} ${c.grade ?? ''} — ${reason ?? 'not available'}`.trim()
                              }
                              onClick={() => openDispatch(c.id)}
                            >
                              Dispatch ▸
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="empty">No stock matches those filters.</p>
          )}
        </>
      )}

      {/* Mounted only for an account that may actually raise one. The sheet
          fetches the customer list as it opens, so for a worker or a lab
          account that list is theirs to be refused rather than theirs to have
          and not render. */}
      {mayDispatch && (
        <NewDispatchSheet
          open={dispatching}
          groups={dispatchable}
          initialGroupId={dispatchFrom}
          onClose={() => setDispatching(false)}
          onPosted={() => void load()}
        />
      )}
    </>
  );
}

export default StockPage;
