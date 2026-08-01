import { crud } from './base.service.js';
import { rpc } from '../config/supabase.js';
import { TABLES, COARSE_GRADE, QC_STATUSES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { poolFor, displayLabel, batchLabel } from '../utils/stockPeriod.js';
import { todayISO } from '../utils/shift.js';

/**
 * The yard, as a ledger.
 *
 * Every packed sack belongs to a stock group, and a dispatch can only draw from
 * one. A special-line batch makes a group per grade it yielded; the coarse line
 * makes one per ten-day period, because coarse sacks are not batch-identified -
 * see utils/stockPeriod.js.
 *
 * Both counts on a group are moved by Postgres functions rather than from here.
 * `record_packed_stock` takes the *change* in a run's packed figure, so packing
 * a run twice to correct it moves the group by the difference; `post_dispatch`
 * draws stock down inside the same transaction that writes the document. Neither
 * count is a writable column in the registry, so there is no path that sets a
 * stock level by hand and steps around the oversell check.
 */

const base = crud(TABLES.stockGroups, { defaultSort: 'created_at' });

const int = (value) => Number(value ?? 0);

/**
 * The manager's row. Everything on the group, including what has already left
 * it, because the back office is the side that reconciles the two.
 */
export const toManagerRow = (row) => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  display_label: displayLabel(row.label),
  quality: row.quality ?? null,
  packed_sacks: int(row.packed_sacks),
  dispatched_sacks: int(row.dispatched_sacks),
  available_sacks: int(row.available_sacks ?? int(row.packed_sacks) - int(row.dispatched_sacks)),
  qc_status: row.qc_status ?? 'pending',
  period_start: row.period_start ?? null,
  period_end: row.period_end ?? null,
  created_at: row.created_at ?? null,
});

/**
 * The supervisor's row - built here rather than by taking fields off the one
 * above, deliberately.
 *
 * A supervisor needs to know what is in the yard and whether the lab has passed
 * it. They have no business knowing who bought what, at what price, or how much
 * of a batch has already been sold, and "the client does not render it" is not
 * a way of keeping any of that from them: it is in the response either way, one
 * devtools tab away. So this is a different serializer with a different field
 * list, and the only way a price or a customer reaches a supervisor is if
 * someone writes it into this object.
 */
export const toSupervisorRow = (row) => ({
  label: displayLabel(row.label),
  quality: row.quality ?? null,
  available_sacks: int(row.available_sacks ?? int(row.packed_sacks) - int(row.dispatched_sacks)),
  qc_status: row.qc_status ?? 'pending',
});

/** `?quality=` and `?qc_status=` off the query string, ignored when blank. */
const filtersFrom = (query = {}) => ({
  ...(query.quality ? { quality: query.quality } : {}),
  ...(query.qc_status ? { qc_status: query.qc_status } : {}),
  ...(query.kind ? { kind: query.kind } : {}),
});

export const stockService = {
  ...base,

  /** The whole yard, newest group first. Manager only - see stock.routes.js. */
  async list(query = {}) {
    const result = await base.list({ order: 'desc', limit: 200, ...query }, filtersFrom(query));
    return { ...result, rows: result.rows.map(toManagerRow) };
  },

  /**
   * What a supervisor may see: the label, the grade, what is left and whether
   * the lab passed it. Groups with nothing left are dropped rather than listed
   * as zero - an empty group is not stock, and the shop floor's question is
   * only ever "what is there".
   */
  async summary(query = {}) {
    const result = await base.list({ order: 'desc', limit: 200, ...query }, filtersFrom(query));
    const rows = result.rows.map(toSupervisorRow).filter((row) => row.available_sacks > 0);
    return { ...result, rows, total: rows.length };
  },

  async findById(id) {
    return toManagerRow(await base.findById(id));
  },

  /**
   * Files the sacks packed off a run into their group.
   *
   * `delta` is the change in the run's packed count, not the count itself: the
   * Packing tab is where a figure gets corrected, and re-sending the total would
   * count the same sacks a second time.
   *
   * The label is worked out here and never taken from the request. A coarse run
   * carries no batch number, so its sacks go into the pool for the day they were
   * packed; anything else is keyed on the batch it was made on and the grade it
   * came out as.
   */
  async recordPacking({ quality, batchNo, delta, packedOn = todayISO(), qcStatus = null } = {}) {
    const change = Math.trunc(Number(delta) || 0);
    if (!change) return null;

    const grade = String(quality ?? '').trim() || COARSE_GRADE;
    const isPool = grade === COARSE_GRADE;

    if (!isPool && !String(batchNo ?? '').trim()) {
      // Nothing to key the group on. Rather than invent a label, the packing is
      // recorded on the run and simply files no stock - which is what the yard
      // already sees, and is fixed by giving the run its batch number.
      return null;
    }

    const pool = isPool ? poolFor(packedOn) : null;
    const row = await rpc('record_packed_stock', {
      p_kind: isPool ? 'pool' : 'batch',
      p_label: isPool ? pool.label : batchLabel(batchNo, grade),
      p_quality: grade,
      p_delta: change,
      p_period_start: isPool ? pool.periodStart : null,
      p_period_end: isPool ? pool.periodEnd : null,
      p_qc_status: qcStatus,
    });
    // A scalar-returning function answers with the row itself; PostgREST wraps a
    // set-returning one in an array.
    const saved = Array.isArray(row) ? row[0] : row;
    return saved ? toManagerRow(saved) : null;
  },

  /**
   * The lab's verdict on a group, which is what decides whether it may leave the
   * yard. post_dispatch() refuses anything that is not `pass`, so this is the
   * only door - there is no way to dispatch around it.
   */
  async setQcStatus(id, qcStatus) {
    if (!QC_STATUSES.includes(qcStatus)) {
      throw ApiError.badRequest(`QC status must be one of: ${QC_STATUSES.join(', ')}`);
    }
    return toManagerRow(await base.update(id, { qc_status: qcStatus }));
  },
};

export default stockService;
