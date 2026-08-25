import { crud } from './base.service.js';
import { stockService } from './stock.service.js';
import { uploadObject, removeObjects } from '../config/supabase.js';
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
        /*
         * The account, not the tester's name.
         *
         * `stock_groups.qc_by` is a foreign key to `users`, and the tester is
         * free text - a person at the bench, often not the account the tablet is
         * signed in as. Writing the name there is refused by Postgres, and
         * because that refusal comes out of the same statement that sets
         * `qc_status`, it did not merely lose the signature: it lost the
         * release. Every verdict the lab filed left the yard exactly as it was.
         *
         * The name is not lost by this. It stays on the test row, which is what
         * the Stock card reads to show who tested the lot - see labTestsFor().
         */
        testedBy: payload.testedByUserId ?? null,
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
   * Takes a test off the record, and takes its verdict off the goods with it.
   *
   * A test row is not the only copy of what it said. Filing one writes the
   * verdict onto the stock group as well - that is what release() is - because
   * post_dispatch() reads `qc_status` and cannot read a test. Deleting only the
   * row therefore used to leave the pallet standing on a pass with nothing
   * behind it: the yard said "QC passed", the Quality tab showed no such test,
   * and the goods loaded.
   *
   * So the group is put back where the tests that remain leave it - the one
   * before this, or the state it would have opened in if this was the only one.
   * See stockService.refreshVerdictFor().
   *
   * Nor is the row the only copy of the sheet. A report attached to a test is a
   * file in Storage, and Storage is a different service with a different idea
   * of what exists - it would have kept the lab's sheet at a public URL long
   * after the test citing it was gone. That goes too, and it goes first.
   *
   * That is allowed to fail without failing the delete. The test is already
   * gone and the group is a derived status that `npm run stock:qc-sync` puts
   * right, so it is logged rather than raised at whoever pressed delete - the
   * same rule record() runs on in the other direction.
   */
  async remove(id) {
    const test = await base.findById(id);

    /*
     * The report before the row, rather than after it.
     *
     * There is no transaction across PostgREST and Storage to have; what there
     * is instead is an order in which a partial failure leaves something
     * coherent, and a test still standing beside its own sheet is that. The
     * other order leaves a file at a public URL that no row and no screen can
     * lead anybody back to - unfindable, unlistable, and reported as a delete
     * that worked. This way the delete can simply be pressed again.
     */
    if (test.attachment_url) await removeObjects(REPORT_BUCKET, test.id);

    await base.remove(id);

    let groups = [];
    try {
      groups = await stockService.refreshVerdictFor(test);
    } catch (err) {
      logger.warn(`Quality test ${id}: the stock group was not put back - ${err.message}`);
    }

    return {
      id,
      batch_no: test.batch_no ?? null,
      quality: test.quality ?? null,
      /** Which groups the delete moved, so the screen can say what changed. */
      stock_groups: groups.map((group) => ({
        id: group.id,
        label: group.display_label ?? group.label,
        qc_status: group.qc_status,
      })),
    };
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
  /**
   * The lab record by batch and then by grade, which is how the plant reads it.
   *
   * A charge goes into an autoclave under a number and is refined into several
   * grades, and each grade is tested on its own: batch 2782 has a verdict for
   * Fine and a separate verdict for Special, and they can differ. So the unit
   * here is the pair, not the batch.
   *
   * That is worth saying because the database has a `quality_latest` view which
   * answers the same question and is keyed on the batch without the grade - so
   * it collapses Fine and Special into whichever was tested last. It is not used
   * here for that reason, and anything else reading it for a per-grade verdict
   * is getting one grade's answer under another grade's name.
   *
   * Newest test wins per pair. The lab re-tests: batch 2782 Fine is on record as
   * held and then passed on the same day, which is a re-test rather than a
   * contradiction, and the standing verdict is the later one. The earlier ones
   * are kept and counted, because "passed on the second go" is a different fact
   * from "passed", and it is the kind an incentive argument turns on.
   */
  async byBatch({ from, to } = {}) {
    const rows = (await base.all({}, { sort: 'ts' })).map(decorate);

    const inWindow = (t) => {
      const day = String(t.tested_at ?? '').slice(0, 10);
      if (!day) return !from && !to;
      return (!from || day >= from) && (!to || day <= to);
    };

    const batches = new Map();
    for (const t of rows) {
      if (!t.batch_no || !inWindow(t)) continue;
      const batch = batches.get(t.batch_no) ?? {
        batch: t.batch_no,
        kind: t.kind ?? null,
        grades: new Map(),
      };
      // A test with no grade against it is still the lab's answer about the
      // batch as a whole, so it is kept under its own heading rather than
      // dropped - see the note on the response below.
      const key = t.grade ?? '';
      const held = batch.grades.get(key) ?? { grade: t.grade ?? null, tests: [] };
      held.tests.push(t);
      batch.grades.set(key, held);
      batches.set(t.batch_no, batch);
    }

    const newestFirst = (a, b) =>
      String(b.tested_at ?? '').localeCompare(String(a.tested_at ?? ''));

    const out = [...batches.values()].map((b) => {
      const grades = [...b.grades.values()]
        .map((g) => {
          const tests = [...g.tests].sort(newestFirst);
          const latest = tests[0];
          const readings = Array.isArray(latest?.params) ? latest.params : [];
          return {
            grade: g.grade,
            verdict: latest?.verdict ?? null,
            testedAt: latest?.tested_at ?? null,
            testedBy: latest?.tested_by ?? null,
            remarks: latest?.remarks ?? null,
            reportUrl: latest?.attachment_url ?? null,
            /** The measured figures on the standing test. Often none - see below. */
            readings,
            /*
             * How many times this grade has been tested, and how many of those
             * were held. "Passed on the third go" is a different fact from
             * "passed", and a screen that only ever showed the standing verdict
             * would report the two identically.
             */
            tests: tests.length,
            held: tests.filter((t) => t.verdict !== 'pass').length,
            history: tests.slice(1).map((t) => ({
              verdict: t.verdict ?? null,
              testedAt: t.tested_at ?? null,
              testedBy: t.tested_by ?? null,
            })),
          };
        })
        .sort((a, b) => String(a.grade ?? '').localeCompare(String(b.grade ?? '')));

      const tested = grades.map((g) => g.testedAt).filter(Boolean).sort();
      return {
        batch: b.batch,
        kind: b.kind,
        grades,
        firstTested: tested[0] ?? null,
        lastTested: tested[tested.length - 1] ?? null,
        /*
         * The batch's own standing, worked out from its grades rather than
         * stored: a batch is only clear when every grade off it is, because one
         * grade on hold is stock that cannot go out.
         */
        verdict: grades.every((g) => g.verdict === 'pass')
          ? 'pass'
          : grades.some((g) => g.verdict === 'pass')
            ? 'part'
            : 'hold',
        readings: grades.reduce((n, g) => n + g.readings.length, 0),
      };
    });

    out.sort((a, b) => String(b.lastTested ?? '').localeCompare(String(a.lastTested ?? '')));

    /**
     * What the record does and does not carry, said out loud.
     *
     * The lab has been recording a verdict and a grade and, so far, no measured
     * figures at all: every test on record has an empty readings list. The
     * screen has to be able to say that rather than drawing a report with
     * nothing in it, because a quality page showing verdicts and no numbers
     * reads as a plant that tests nothing - and what is actually happening is a
     * plant that tests and does not write the results down here yet.
     */
    const totals = {
      batches: out.length,
      grades: out.reduce((n, b) => n + b.grades.length, 0),
      withReadings: out.filter((b) => b.readings > 0).length,
      onHold: out.filter((b) => b.verdict !== 'pass').length,
    };

    return { window: { from: from ?? null, to: to ?? null }, totals, batches: out };
  },

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
