import { crud } from './base.service.js';
import { stockService } from './stock.service.js';
import { uploadObject } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { TABLES, QUALITIES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';

const base = crud(TABLES.qualityTests, { defaultSort: 'ts' });

/** Where the lab's photos and PDFs go. Public bucket, one folder per test. */
const REPORT_BUCKET = 'qc-reports';
const MAX_REPORT_BYTES = 8 * 1024 * 1024;

/** `data:image/jpeg;base64,...` - what the tablets hand a file over as. */
function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]*)(?:;[^,]*)?;base64,(.+)$/s.exec(String(dataUrl ?? ''));
  if (!match) throw ApiError.badRequest('The report has to be a base64 data URL');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw ApiError.badRequest('The report is empty');
  if (bytes.length > MAX_REPORT_BYTES) throw ApiError.badRequest('The report is larger than 8 MB');
  return { bytes, contentType: match[1] || 'application/octet-stream' };
}

/** Storage keys are URLs: keep the name readable and drop everything else. */
const safeName = (name) =>
  (String(name ?? '').replace(/[^\w.-]+/g, '_').replace(/^_+/, '') || 'report').slice(-80);

/**
 * The lab keys its tests to the batch *number* and calls the grade `quality`;
 * `grade`, `tested_at` and `tested_by` are exposed as aliases so the client
 * models stay readable.
 */
const decorate = (row) =>
  row && {
    ...row,
    grade: row.quality ?? null,
    batch_id: row.batch_no ?? null,
    tested_at: row.ts ?? row.created_at ?? null,
    tested_by: row.tester ?? null,
    remarks: row.notes ?? null,
  };

const decorateList = (result) => ({ ...result, rows: result.rows.map(decorate) });

export const qualityService = {
  ...base,
  qualities: QUALITIES,

  async list(query = {}, filters = {}) {
    return decorateList(await base.list(query, filters));
  },

  async findById(id) {
    return decorate(await base.findById(id));
  },

  /** Tests for a batch, oldest first - `batchRef` is the batch number. */
  listForBatch: async (batchRef, query = {}) =>
    decorateList(await base.list({ ...query, order: 'asc' }, { batch_no: String(batchRef) })),


  async record(payload) {
    const test = await base.create({
      kind: payload.kind ?? 'batch',
      batch_no: payload.batchNo ?? payload.batchId ?? null,
      run_id: payload.runId ?? null,
      machine_id: payload.machineId ?? null,
      quality: payload.grade ?? payload.quality ?? null,
      verdict: payload.verdict, // pass | hold
      params: payload.params ?? [],
      tester: payload.testedBy ?? null,
      notes: payload.remarks ?? null,
      shift_date: payload.shiftDate ?? null,
      shift: payload.shift ?? null,
      // Carried over when a grade is re-tested and the old report still
      // stands; a new file replaces it through attachReport() below.
      attachment_url: payload.attachmentUrl ?? null,
      attachment_name: payload.attachmentName ?? null,
      ts: payload.testedAt || new Date().toISOString(),
    });

    /*
     * The yard keeps its own copy of the verdict, because a stock group's
     * `qc_status` is what post_dispatch() checks and it cannot read a test row.
     * Passing a batch here is what releases its sacks, so it happens in the
     * same call rather than being a second thing for the back office to
     * remember - and there is no screen that would remind them.
     *
     * A coarse sample decides its pool the same way, with one difference that
     * matters: a pool nobody has sampled still sells, because coarse goes out
     * on the line running to specification rather than on a certificate per
     * pool - waiting for the bench is what used to strand every sack. Absence
     * is not refusal. A hold is, and stops the whole period.
     *
     * A failure here must not lose the test. The lab is on a tablet at a bench
     * and the row is already filed; the group is a derived status that the next
     * packing or `npm run stock:qc-sync` will put right, so it is logged rather
     * than raised at someone holding a sample.
     */
    let released = null;
    try {
      released = await stockService.applyLabVerdict({
        kind: test.kind,
        batchNo: test.batch_no,
        quality: test.quality,
        verdict: test.verdict,
        // Carried onto the stock group beside the status. The test row keeps its
        // own tester, but the group is what post_dispatch() reads and what the
        // yard shows, and a release with no name against it cannot afterwards be
        // told from one nobody made.
        testedBy: test.tester ?? null,
      });
    } catch (err) {
      logger.warn(`Quality test ${test.id}: the stock group was not released - ${err.message}`);
    }

    /**
     * Which stock group this verdict actually moved, or null if it moved none.
     *
     * Null is the case worth reporting, and it is not an error. A verdict
     * releases stock that already exists; it does not create any. Pass a batch
     * nobody has bagged yet and there is no group to release - correct, and
     * completely invisible from the bench, which files the test, watches
     * nothing appear in the yard, and reasonably concludes the app is broken.
     *
     * So the answer is handed back and the screen says which happened. The
     * fault this closes is not a missing write; it is a write that succeeded
     * and looked like nothing.
     */
    return { ...decorate(test), stock_released: released };
  },

  /**
   * Hangs the lab's report - a photo of the sheet, or a PDF - on a test that is
   * already filed. The file goes to Storage and the row keeps its public URL,
   * so nothing base64 is ever read back out of the database.
   */
  async attachReport(id, { name, dataUrl } = {}) {
    const test = await base.findById(id); // 404s before anything is uploaded
    const { bytes, contentType } = decodeDataUrl(dataUrl);
    const file = safeName(name);
    const url = await uploadObject(REPORT_BUCKET, `${test.id}/${file}`, {
      body: bytes,
      contentType,
    });
    return decorate(await base.update(id, { attachment_url: url, attachment_name: name || file }));
  },

  /** Pass rate per grade over the window. */
  async summary({ from, to } = {}) {
    const rows = (await base.all()).map(decorate);
    const byGrade = {};
    for (const t of rows) {
      const day = t.tested_at?.slice(0, 10);
      if (from && day && day < from) continue;
      if (to && day && day > to) continue;
      const key = t.grade ?? 'Unspecified';
      const g = (byGrade[key] ||= { grade: key, total: 0, pass: 0, hold: 0 });
      g.total += 1;
      if (t.verdict === 'pass') g.pass += 1;
      else g.hold += 1;
    }
    return Object.values(byGrade).map((g) => ({
      ...g,
      passRate: g.total ? +((g.pass / g.total) * 100).toFixed(1) : 0,
    }));
  },
};

export default qualityService;
