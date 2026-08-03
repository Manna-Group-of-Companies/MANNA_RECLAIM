import { crud } from './base.service.js';
import {
  TABLES,
  SACK_KG,
  LOADING_MODES,
  LOADING_MATERIALS,
  LOADING_RATE_KEYS,
  forcedLoadingMode,
} from '../config/constants.js';
import { rateService } from './rate.service.js';
import { logger } from '../config/logger.js';

/**
 * What it cost to put a load on a truck.
 *
 * Every dispatch involves a loading job, and the job is costed one of two ways:
 *
 *   contract  a per-kg rate to the loading gang. What reclaim normally goes on.
 *   manhour   manpower allotted x time worked, at the day-labour rate. The only
 *             method available for moulded goods, which come off the presses
 *             and have no per-kg contract behind them.
 *
 * `mixed` is what a contract job becomes when day labour also worked on it. It
 * is not a third form to fill in, and it is not something the office selects -
 * see coerceMode() for why.
 *
 * Two things about where this cost lands, because both are easy to get wrong.
 *
 * It belongs to the dispatch and never to production. The rupees-per-kg a batch
 * carries is frozen when the batch consumes crumb; loading happens afterwards,
 * to goods that already exist, so folding it back into rupees-per-kg reclaim
 * would be costing the same rubber against a lorry that had not been loaded
 * when it was made. It sits beside transport as a cost to serve. Picking is the
 * mirror image and the reason the distinction is worth stating: picking is
 * upstream of production and does correctly flow into rupees-per-kg crumb and
 * then reclaim.
 *
 * And the rates are snapshotted, not looked up. Both figures are copied onto
 * the entry as it is written and never read again, so revising a rate in the
 * settings prices the next job and leaves every job already done exactly where
 * it was. A cost that changes when somebody edits a settings field is not a
 * record of anything.
 */

const base = crud(TABLES.loadingActivities, { defaultSort: 'created_at' });

const num = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** Sacks are the unit the yard counts in; kg is the unit loading is paid in. */
export const kgOfSacks = (sacks) => num(sacks) * SACK_KG;

/**
 * The mode a loading entry actually has, whatever it claims to have.
 *
 * The rule being enforced: any day-labour worker on any loading activity has to
 * have their time accounted in man-hours, including on a load that is normally
 * contract-rated. Left to a dropdown that rule survives exactly as long as the
 * manager's attention does - the labourers get entered, the mode stays on
 * `contract`, and their hours vanish from the costing without anything looking
 * wrong. So the mode is derived from what was entered rather than taken from
 * the payload:
 *
 *   moulded goods            -> manhour, always. There is no contract rate to
 *                               apply, so the contract half is dropped rather
 *                               than costed against a rate that does not exist.
 *   labour entered, kg too   -> mixed, whatever the payload said.
 *   labour entered, no kg    -> manhour. Nothing was contract-rated.
 *   no labour entered        -> contract. There is nothing to mix in, and a
 *                               payload claiming `mixed` is corrected.
 *
 * The same rules are in post_dispatch() and the same contradiction is refused
 * by a CHECK on the table, so this is the convenient place it happens rather
 * than the only one.
 */
export function coerceMode({ material_kind: material, loading_mode: claimed, labourers, hours, kg }) {
  if (forcedLoadingMode(material) === 'manhour') return 'manhour';
  const hasLabour = num(labourers) > 0 && num(hours) > 0;
  if (!hasLabour) return 'contract';
  return num(kg) > 0 && claimed !== 'manhour' ? 'mixed' : 'manhour';
}

/**
 * A loading entry, costed and ready to be written, from what the form sent and
 * what the settings hold.
 *
 * `kg` defaults to what the document weighs rather than being asked for again:
 * the gang is paid on what went onto the vehicle, and that is what the lines
 * already say. The caller works it out from each group's own per-unit weight and
 * passes it as `kg`; `sacks` remains as the older way of saying the same thing
 * for a caller that has only a sack count, and is fifty kilos apiece. It can be
 * overridden, because a weighbridge net is the better figure when there is one -
 * and it is forced to zero on moulded goods, which have no contract half.
 *
 * Rates are read once here and copied onto the entry. Nothing reads them again.
 */
export function loadingEntry(input = {}, rates = {}, { sacks = 0, kg: documentKg = null } = {}) {
  const material = LOADING_MATERIALS.includes(input.material_kind) ? input.material_kind : 'reclaim';
  const labourers = Math.max(0, Math.trunc(num(input.manhour_labourers)));
  const hours = Math.max(0, num(input.manhour_hours));

  const claimed = LOADING_MODES.includes(input.loading_mode) ? input.loading_mode : 'contract';
  const fallbackKg = documentKg != null ? num(documentKg) : kgOfSacks(sacks);
  const kg =
    material === 'moulded'
      ? 0
      : Math.max(0, input.kg_loaded == null ? fallbackKg : num(input.kg_loaded));

  const mode = coerceMode({
    material_kind: material,
    loading_mode: claimed,
    labourers,
    hours,
    kg,
  });

  // A contract entry carries no labour, and a man-hour entry no kg. Zeroing the
  // half that does not apply keeps the stored row honest about what it is: the
  // costs are generated from these columns in Postgres, so a stray figure left
  // in the unused half would be money.
  const keepsContract = mode === 'contract' || mode === 'mixed';
  const keepsLabour = mode === 'manhour' || mode === 'mixed';

  return {
    loading_mode: mode,
    material_kind: material,
    kg_loaded: keepsContract ? round2(kg) : 0,
    contract_rate_per_kg: keepsContract ? num(rates[LOADING_RATE_KEYS.contractPerKg]) : 0,
    manhour_labourers: keepsLabour ? labourers : 0,
    manhour_hours: keepsLabour ? round2(hours) : 0,
    daily_labour_rate: keepsLabour ? num(rates[LOADING_RATE_KEYS.labourPerHour]) : 0,
    vehicle_no: input.vehicle_no?.trim() || null,
    remarks: input.remarks?.trim() || null,
  };
}

/**
 * What a stored entry cost, off its own snapshot.
 *
 * Postgres generates these three columns, so a row read back already has them.
 * They are recomputed here anyway because the same arithmetic has to work on an
 * entry that has not been written yet - the form's running total, and the
 * response to the post - and having two expressions for one figure is how the
 * screen and the ledger end up disagreeing by a rupee.
 */
export function costOf(entry = {}) {
  const contract = num(entry.kg_loaded) * num(entry.contract_rate_per_kg);
  const manhour = num(entry.manhour_labourers) * num(entry.manhour_hours) * num(entry.daily_labour_rate);
  return {
    contract_cost: round2(contract),
    manhour_cost: round2(manhour),
    loading_cost: round2(contract + manhour),
  };
}

/**
 * Whether this job recorded any labour at all.
 *
 * A dispatch can legitimately have no loading entry - the customer's own crew
 * loading their own vehicle is a real thing - but an entry that names nobody
 * and no kg is a form somebody tabbed through. Either way the dispatch list
 * flags it, because a gap that is visible gets filled in and a gap that is
 * silent becomes the number everyone quotes.
 */
export const hasLabour = (entry) =>
  Boolean(entry) && (num(entry.manhour_labourers) > 0 || num(entry.kg_loaded) > 0);

/**
 * The loading cost spread across the lines it covers, by kg.
 *
 * One loading entry is one truck, and a truck carries whatever qualities are
 * going to that customer that day - so the cost has to come back apart before
 * any one quality's margin can be worked out. kg is what the contract rate is
 * quoted in, so kg is what this weights by.
 *
 * It weights by an explicit `kg` on the line where there is one, and falls back
 * to the sacks at fifty kilos where there is not. That fallback used to be the
 * whole rule, on the sound argument that sacks are all 50 kg so the two orders
 * agree - and it stopped being sound when the presses reached the yard. A line
 * of four thousand moulded pieces and a line of forty sacks are not in the same
 * proportion by count as they are by weight, and a gang paid to load a truck was
 * paid for the weight. So the caller works the kg out from the group's own
 * per-unit weight and passes it in.
 *
 * The rounding residue goes to the largest line rather than being dropped. The
 * shares are read beside a total that is a stored figure, and a split that does
 * not add back up to it is a discrepancy somebody has to chase.
 */
export function splitByKg(loadingCost, lines = []) {
  const total = round2(num(loadingCost));
  const weights = lines.map((line) =>
    Math.max(0, line.kg != null ? num(line.kg) : kgOfSacks(line.sacks)),
  );
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (!lines.length || !total) return lines.map(() => 0);

  // Nothing to weight by - a document whose lines all carry no weight should not
  // have been posted, but the cost is real, so it is spread evenly rather than
  // silently assigned to whichever line happens to be first.
  const shares = sum
    ? weights.map((w) => round2((total * w) / sum))
    : lines.map(() => round2(total / lines.length));

  const drift = round2(total - shares.reduce((acc, s) => acc + s, 0));
  if (drift) {
    let biggest = 0;
    for (let i = 1; i < shares.length; i += 1) if (shares[i] > shares[biggest]) biggest = i;
    shares[biggest] = round2(shares[biggest] + drift);
  }
  return shares;
}

export const loadingService = {
  ...base,

  /** The settings figures a new entry snapshots. Read once, per post. */
  async currentRates() {
    const { data } = await rateService.costRates();
    return {
      [LOADING_RATE_KEYS.contractPerKg]: num(data?.[LOADING_RATE_KEYS.contractPerKg]),
      [LOADING_RATE_KEYS.labourPerHour]: num(data?.[LOADING_RATE_KEYS.labourPerHour]),
    };
  },

  /**
   * The entry to hand post_dispatch(), rates already copied in. Answers null
   * when the form recorded no loading at all, which writes no entry - see the
   * note on hasLabour() for why that is left as a gap rather than a zero.
   */
  async prepare(input, { sacks = 0, kg = null } = {}) {
    if (!input) return null;
    const rates = await loadingService.currentRates();
    return loadingEntry(input, rates, { sacks, kg });
  },

  /**
   * Every loading entry for the given dispatches, keyed by dispatch id.
   *
   * Answers empty rather than raising when the project has no
   * `loading_activities` table - which is a project that has not run
   * supabase/migrations/0002_loading_activity.sql yet. A dispatch list that
   * 500s because the costing half of the feature has not been migrated is
   * worse than one that shows the documents and reports every load as having no
   * labour recorded, which is exactly what an un-migrated project honestly has.
   * The gap is already on the list; this keeps it a gap rather than an outage.
   */
  async byDispatch(dispatchIds = []) {
    const ids = [...new Set(dispatchIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await loadingService.rowsFor({ dispatch_id: ids });
    return new Map(rows.map((row) => [row.dispatch_id, toRow(row)]));
  },

  /**
   * The raw entries matching a filter, or none at all where the table is not
   * in the project. One place to be forgiving, so no caller has to remember.
   */
  async rowsFor(filters = {}) {
    try {
      return await base.all(filters, { sort: 'created_at' });
    } catch (err) {
      if (isMissingTable(err)) {
        warnOnce();
        return [];
      }
      throw err;
    }
  },
};

/**
 * PostgREST's answer when the relation is not there. Matched on the code it
 * sends rather than on the sentence, which is a translated string.
 */
const isMissingTable = (err) =>
  err?.pgCode === '42P01' ||
  err?.status === 404 ||
  /Could not find the table/i.test(String(err?.message ?? ''));

/** Said once per process. A read per dispatch list would say it all day. */
let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  logger.warn(
    'No loading_activities table - loading costs are not being recorded. ' +
      'Run supabase/migrations/0002_loading_activity.sql.',
  );
}

/** A stored entry as the API states it, with its costs off its own snapshot. */
export const toRow = (row) =>
  row && {
    id: row.id,
    dispatch_id: row.dispatch_id,
    loading_mode: row.loading_mode,
    material_kind: row.material_kind ?? 'reclaim',
    kg_loaded: num(row.kg_loaded),
    contract_rate_per_kg: num(row.contract_rate_per_kg),
    manhour_labourers: num(row.manhour_labourers),
    manhour_hours: num(row.manhour_hours),
    daily_labour_rate: num(row.daily_labour_rate),
    vehicle_no: row.vehicle_no ?? null,
    remarks: row.remarks ?? null,
    created_at: row.created_at ?? null,
    ...costOf(row),
    has_labour: hasLabour(row),
  };

export default loadingService;
