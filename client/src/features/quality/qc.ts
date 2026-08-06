import { QUALITIES } from '@/config/constants';
import type {
  Batch,
  QcStatus,
  Quality,
  QualityTest,
  RemovedQualityTest,
  Verdict,
} from '@/types/models';

/**
 * Batch QC is quality-wise: one verdict per grade, not one per batch. These are
 * the rules the Quality tab, the tab badge and Dispatch's hold warning all read
 * the tests through, so they cannot drift apart.
 */

/**
 * The grades a batch is tested on. A paired autoclave load names the ones it
 * yielded; anything that does not is tested across the board.
 */
export const gradesFor = (batch?: Batch | null): Quality[] =>
  batch?.qualities?.length ? [...batch.qualities] : [...QUALITIES];

const at = (test: QualityTest) => new Date(test.tested_at ?? test.ts ?? 0).getTime() || 0;

const refOf = (test: QualityTest) => String(test.batch_no ?? test.batch_id ?? '');

/**
 * The verdict that stands for one grade. Tests are append-only - a re-test is a
 * new row - so the newest one is the current answer.
 */
export const latestTest = (
  tests: QualityTest[],
  batchRef: string,
  grade: Quality,
): QualityTest | null =>
  tests.reduce<QualityTest | null>((newest, test) => {
    if ((test.kind ?? 'batch') !== 'batch') return newest;
    if (refOf(test) !== String(batchRef)) return newest;
    if ((test.grade ?? test.quality) !== grade) return newest;
    return !newest || at(test) > at(newest) ? test : newest;
  }, null);

export interface GradeStatus {
  grade: Quality;
  /** The test that stands, or null while the grade is untested. */
  test: QualityTest | null;
  verdict: Verdict | null;
}

export interface BatchQc {
  grades: GradeStatus[];
  pass: number;
  hold: number;
  untested: number;
  anyHold: boolean;
  allDone: boolean;
}

/** Where a batch stands, grade by grade. */
export const batchQc = (batch: Batch, tests: QualityTest[]): BatchQc => {
  const grades = gradesFor(batch).map((grade) => {
    const test = latestTest(tests, batch.ref, grade);
    return { grade, test, verdict: test ? test.verdict : null };
  });
  const hold = grades.filter((g) => g.verdict === 'hold').length;
  const untested = grades.filter((g) => !g.test).length;
  return {
    grades,
    pass: grades.length - hold - untested,
    hold,
    untested,
    anyHold: hold > 0,
    allDone: untested === 0,
  };
};

/** The one-line state of a batch, as its card and its sheet both show it. */
export const batchQcChip = (qc: BatchQc): { label: string; tone: 'hold' | 'ok' | 'part' | 'none' } => {
  if (qc.anyHold) return { label: `HOLD · ${qc.hold}`, tone: 'hold' };
  if (qc.allDone) return { label: 'All passed', tone: 'ok' };
  if (qc.pass > 0) return { label: `${qc.pass}/${qc.grades.length} done`, tone: 'part' };
  return { label: 'Untested', tone: 'none' };
};

/** Where a group is left once the test that was speaking for it is gone. */
const QC_WORD: Record<QcStatus, string> = {
  pass: 'QC passed',
  fail: 'QC failed',
  pending: 'awaiting the lab',
};

/**
 * What taking a test off the record moved in the yard, for the toast.
 *
 * Here rather than in either screen because the delete is now reachable from
 * two - the back office's lab record and the bench's list of recent verdicts -
 * and a delete that reported itself differently depending on which one it was
 * pressed from would be two controls wearing one name.
 *
 * Nothing moved is the ordinary case rather than a failure: a verdict releases
 * stock that already exists and does not create any, so a test filed against a
 * batch nobody bagged was never carried by a group. Said out loud, because
 * "removed" with no more to it is indistinguishable from a delete that left a
 * released pallet standing.
 */
export const removedText = (removed: RemovedQualityTest): string =>
  removed.stock_groups.length
    ? removed.stock_groups.map((g) => `${g.label} → ${QC_WORD[g.qc_status]}`).join(' · ')
    : 'no stock in the yard was standing on it';
