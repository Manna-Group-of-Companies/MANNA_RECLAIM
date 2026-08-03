import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import { Badge, Button, EmptyState, PageLoader, QualityChip, ViewHead } from '@/components/ui';
import { NewDispatchSheet, type DispatchableStock } from '@/features/dispatch/NewDispatchSheet';
import { ADMIN_ROLES, DISPATCH_ROLES, UNIT_NOUN, counted } from '@/config/constants';
import { icons } from '@/config/icons';
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
  StockPool,
  StockSummaryRow,
  StockUnit,
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
 * Two things did not move with it, and both are still gated here:
 *
 *   - the packed-against-dispatched ledger. A supervisor's cards come from
 *     /stock/summary, which says what is there and what the lab said and
 *     nothing about what has been sold off it. The route refuses them /stock
 *     outright, so this is not a matter of the screen being careful.
 *   - the QC verdict. Releasing goods for sale is the office's, so Hold and
 *     Release are drawn for a manager only.
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
  label: string;
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
   * How far through its three samples a coarse pool is, and whether any of
   * them came back a hold. Null on a batch or a moulded group, which are
   * certified as a lot rather than sampled across a period.
   */
  samples: { taken: number; total: number; anyHold: boolean } | null;
}

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

const fromGroup = (row: StockGroup, pool?: StockPool): YardCard => ({
  id: row.id,
  label: row.display_label,
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
  samples: samplesOf(pool),
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
  label: row.label,
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
  samples: samplesOf(pool),
});

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
  const role = useAppSelector((s) => s.auth.user?.role);
  /*
   * Two different questions, and they are no longer the same one.
   *
   * `isManager` is the back office - it decides which yard read this account
   * gets (the full ledger or the floor's summary) and whether the QC verdict
   * can be changed from here. `mayDispatch` is who can raise a document, which
   * is now the yard as well.
   */
  const isManager = Boolean(role && ADMIN_ROLES.includes(role));
  const mayDispatch = Boolean(role && DISPATCH_ROLES.includes(role));
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

  /** The group whose verdict is being changed by hand, while it is in flight. */
  const [settingQc, setSettingQc] = useState<string | null>(null);

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

  /**
   * The back office setting a verdict by hand.
   *
   * The lab is the authority on whether goods may be sold, and this does not
   * take that away - filing a test still overrides whatever is set here, because
   * a re-test exists to change the answer. What this is for is the cases the
   * bench cannot reach:
   *
   *   - a pool the plant has decided to hold, which no test can address because
   *     coarse is not batch-identified and never appears on the Quality tab;
   *   - failed stock that has since been reworked, or a pack the office has
   *     satisfied itself about;
   *   - anything the lab has not got to and the office is willing to sign for.
   *
   * Until this existed the column could only be reached with a hand-made
   * request, which meant a group the lab could not test was stuck at `pending`
   * for good with post_dispatch() refusing to load it - and that is not a
   * theoretical failure, it is what happened to every coarse sack the plant
   * packed before the pools were released.
   *
   * It is signed. `qc_source` records that it was set here rather than filed at
   * the bench, and the card says so, because the two are not the same event and
   * somebody will eventually be asking which this was.
   */
  const applyVerdict = useCallback(
    async (id: string, status: QcStatus) => {
      setSettingQc(id);
      try {
        await stockService.setQcStatus(id, status);
        notify(status === 'pass' ? 'Released for dispatch' : 'Put on hold');
        await load();
      } catch (err) {
        notify(toRequestError(err).message, 'err');
      } finally {
        setSettingQc(null);
      }
    },
    [load, notify],
  );

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
      {/* The count of groups on screen, then what is actually sellable. The
          second is the answer to "can this order go out today"; the first is
          only how much of the yard the filters are letting through. */}
      <ViewHead
        title="Stock"
        meta={
          <>
            {filtered ? `${visible.length} of ${cards.length}` : cards.length} groups ·{' '}
            {readyLine(standing.pass)}
          </>
        }
      />

      {!cards.length ? (
        <EmptyState
          icon={icons.packing}
          title="Nothing packed and ready"
          hint="Bag a weighed run or box a press run on the Packing tab and it is filed here as stock — coarse into its ten-day pool, moulded goods against their product and pack, everything else against its batch and grade."
        />
      ) : (
        <>
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
                chip(g, gradeCounts[g] ?? 0, grade === g, `q-${g}`, () => setGrade(g)),
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
                    const loadable = mayDispatch && c.qc === 'pass' && c.available > 0;
                    return (
                      <article
                        key={c.id}
                        className={cn('scard', c.qc, c.available <= 0 && 'spent')}
                      >
                        <div className="top">
                          <div className="who">
                            <div className="row1">
                              <b>{c.label}</b>
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
                              The verdict, by hand, and the back office's alone -
                              it is what releases goods for sale, and the route
                              behind it refuses anyone else. Offered as the one
                              move that is not already true, so there is no
                              button that does nothing.
                            */}
                            {isManager && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={settingQc === c.id}
                                title={
                                  c.qc === 'pass'
                                    ? 'Stop this leaving the yard'
                                    : 'Release it without waiting for the lab — recorded against your account'
                                }
                                onClick={() =>
                                  void applyVerdict(c.id, c.qc === 'pass' ? 'fail' : 'pass')
                                }
                              >
                                {c.qc === 'pass' ? 'Hold' : 'Release'}
                              </Button>
                            )}
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
                                loadable
                                  ? `Dispatch ${c.label}`
                                  : `${c.label} — ${reason ?? 'not available'}`
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
