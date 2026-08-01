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

/**
 * The lab's table, reached from here rather than through quality.service.js.
 *
 * The verdict on a grade and the status of the stock made to that grade are the
 * same fact kept in two places - the lab writes a test row, post_dispatch()
 * reads `stock_groups.qc_status` - and something has to carry it across. Going
 * through the other service would make the two import each other, so the two
 * columns this needs are read straight off the table.
 */
const testsTable = crud(TABLES.qualityTests, { defaultSort: 'ts' });

const int = (value) => Number(value ?? 0);

/**
 * A lab verdict as a stock status. The lab records `pass` or `hold`; the yard
 * has no third state between passed and blocked, so a hold is a `fail` here.
 * Either way the sacks do not leave. Anything else answers null and changes
 * nothing, so an unrecognised verdict cannot release stock by accident.
 */
const toQcStatus = (verdict) => (verdict === 'pass' ? 'pass' : verdict === 'hold' ? 'fail' : null);

/** A batch test - one that names a batch and a grade - rather than a shift sample. */
const isBatchTest = (test) =>
  (test?.kind ?? 'batch') === 'batch' && Boolean(test?.batch_no) && Boolean(test?.quality);

/**
 * Where one grade of one batch stands with the lab, as a stock status, or null
 * while it is untested. Tests are append-only - a re-test is a new row, not an
 * edit - so the newest row is the answer, which is the same rule the Quality
 * tab reads them by.
 */
async function verdictFor(batchNo, quality) {
  const test = await testsTable.findOne(
    { batch_no: String(batchNo), quality: String(quality) },
    { sort: 'ts', ascending: false },
  );
  return isBatchTest(test) ? toQcStatus(test.verdict) : null;
}

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
  // The group's key, and nothing about it. A supervisor posts dispatches, and a
  // dispatch line names the group its sacks came off - without this there is no
  // way to say which stock left, short of handing the fuller row over. An
  // opaque id says nothing about who bought what or for how much, which is what
  // the rest of this serializer exists to withhold.
  id: row.id,
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
    const batch = String(batchNo ?? '').trim();

    if (!isPool && !batch) {
      // Nothing to key the group on. Rather than invent a label, the packing is
      // recorded on the run and simply files no stock - which is what the yard
      // already sees, and is fixed by giving the run its batch number.
      return null;
    }

    /*
     * A batch is often sampled before it is bagged, so by the time the sacks
     * are filed the lab may already have answered. Left unasked, the group
     * would be created `pending` with a passed test sitting beside it and
     * nothing would ever reconcile the two - the group is only created once,
     * and the test that would have released it was recorded before it existed.
     */
    const pool = isPool ? poolFor(packedOn) : null;
    const qc = qcStatus ?? (isPool ? null : await verdictFor(batch, grade));

    const row = await rpc('record_packed_stock', {
      p_kind: isPool ? 'pool' : 'batch',
      p_label: isPool ? pool.label : batchLabel(batch, grade),
      p_quality: grade,
      p_delta: change,
      p_period_start: isPool ? pool.periodStart : null,
      p_period_end: isPool ? pool.periodEnd : null,
      p_qc_status: qc,
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

  /**
   * The other door, and the one the lab actually walks through: a verdict just
   * filed against a batch and a grade, pushed onto the stock group made to it.
   *
   * Filing a test and releasing the stock are one act on the floor. Until this
   * existed they were two records that never spoke - the Quality tab read the
   * test rows and said a batch had passed, while the group kept the `pending`
   * it was created with, so the yard showed stock the lab had cleared as
   * awaiting the lab and post_dispatch() refused to load it. There was no
   * screen that set the column either; it could only be reached by hand
   * through PATCH /stock/:id/qc.
   *
   * Addressed by label, because `<batch>-<grade>` is precisely what a batch
   * group's label is built from, and a verdict names a batch and a grade rather
   * than a group id. Nothing matching means the sacks are not bagged yet, which
   * is not a failure: recordPacking() asks the lab on the way in, so the group
   * picks the verdict up when it is created.
   *
   * The newest verdict wins outright, including over a status the back office
   * set by hand. The lab is the authority on whether goods may be sold, and a
   * re-test exists to change the answer.
   */
  async applyLabVerdict({ kind = 'batch', batchNo, quality, verdict } = {}) {
    const batch = String(batchNo ?? '').trim();
    const grade = String(quality ?? '').trim();
    // A shift or machine sample is not about a lot of stock, and coarse sacks
    // pool by period and carry no batch number - neither addresses a group.
    if (kind !== 'batch' || !batch || !grade || grade === COARSE_GRADE) return null;

    const status = toQcStatus(verdict);
    if (!status) return null;

    const { rows } = await base.updateWhere(
      { label: batchLabel(batch, grade) },
      { qc_status: status },
    );
    return rows.length ? toManagerRow(rows[0]) : null;
  },

  /**
   * Puts the whole yard back in step with the lab in one pass, for the groups
   * that were packed and tested before either door above existed and are
   * therefore sitting on a status nobody can now correct from a screen.
   *
   * Only batch groups: a pool has no batch number to test against, and its
   * status stays the back office's to set. A group the lab has not answered on
   * is left exactly as it is - untested is not the same as failed, and this
   * must not turn a manual verdict on an untested group back into `pending`.
   *
   * `apply: false` reports what it would change without writing, which is the
   * form to run first on a yard with stock in it.
   */
  async reconcileQc({ apply = true } = {}) {
    const groups = (await base.all({ kind: 'batch' })).map(toManagerRow);
    if (!groups.length) return [];

    // Every test in one read rather than one read per group, then walked
    // oldest-first so the newest verdict on each batch-and-grade is what is
    // left standing in the map.
    const tests = await testsTable.all({}, { sort: 'ts', ascending: true });
    const standing = new Map();
    for (const test of tests) {
      if (!isBatchTest(test)) continue;
      const status = toQcStatus(test.verdict);
      if (status) standing.set(batchLabel(test.batch_no, test.quality), status);
    }

    // The map is keyed on `<batch>-<grade>`, which is the label a batch group
    // was created under - so the group's own label is the lookup, with no
    // splitting of a batch number that may hold a hyphen of its own.
    const stale = groups
      .map((group) => ({ group, status: standing.get(group.label) }))
      .filter(({ group, status }) => status && status !== group.qc_status);

    if (apply) {
      for (const { group, status } of stale) {
        await base.update(group.id, { qc_status: status });
      }
    }

    return stale.map(({ group, status }) => ({
      id: group.id,
      label: group.label,
      from: group.qc_status,
      to: status,
    }));
  },
};

export default stockService;
