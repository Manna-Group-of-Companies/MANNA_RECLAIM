import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  fetchPendingQuality,
  fetchQualityRecord,
  fetchQualitySummary,
  removeTest,
} from '@/features/quality/qualitySlice';
import { batchQc, batchQcChip, removedText, type BatchQc } from '@/features/quality/qc';
import { DELETE_ROLES, QUALITIES } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { dayLong, dayMonth, lastNDays, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Batch, QualityTest, Verdict } from '@/types/models';

/**
 * The lab record as the back office reads it: how each grade is passing, which
 * open batches are still short a verdict, and every test on file with its
 * report.
 *
 * Reading, and one write. Verdicts are filed at the bench, on the shop floor's
 * own Quality tab - which manager and admin now reach directly, so this page is
 * not the way to one and does not pretend to be. What a desk is for is the
 * record: a month of tests at once, sorted and filtered, which is not a question
 * anybody asks standing at a bench.
 *
 * The write is a delete, and it is the one lab edit a re-test cannot make. Tests
 * are append-only: the bench corrects itself by filing again, and the newest
 * verdict standing is the one the yard reads. That fixes a wrong reading and
 * cannot fix a wrong address - a test filed against the wrong batch or the wrong
 * grade goes on releasing goods it was never about, and every re-test lands on a
 * different key. Taking the row off is what puts those goods back, which is why
 * it is admin-gated and why it says what it moved.
 */

/**
 * How far back the page looks. The lab tests daily, so a month is the default.
 *
 * `0` is the whole record. It is here because the question this page is most
 * often opened with - what has been produced that nobody has checked - is not a
 * question about the last thirty days: an untested batch does not become less
 * untested by ageing out of a window, it just stops being visible.
 */
const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last year' },
  { days: 0, label: 'Everything on record' },
];

const testedAt = (test: QualityTest) => test.tested_at ?? test.ts ?? null;

const testerOf = (test: QualityTest) => test.tested_by ?? test.tester ?? '—';

const remarkOf = (test: QualityTest) => test.remarks ?? test.notes ?? null;

/** Newest verdict first; an undated row sorts last rather than to the top. */
const byNewest = (a: QualityTest, b: QualityTest) =>
  (testedAt(b) ?? '').localeCompare(testedAt(a) ?? '');

const verdictBadge = (verdict: Verdict) => (verdict === 'hold' ? 'warn' : 'ok');

/** Holds first, then batches still awaiting a test, then the settled ones. */
const attention = (qc: BatchQc) => (qc.anyHold ? 0 : qc.allDone ? 2 : 1);

export function AdminQualityPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { record, recordLoading, summary, loading, error } = useAppSelector((s) => s.quality);
  /**
   * The batches and the verdicts this page reads, which are the back office's
   * own window rather than the bench's working set - every charge in the
   * window, open or closed, on any line. See fetchQualityRecord.
   */
  const { batches, tests } = record;
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  /**
   * Whether this account may take a verdict off the record.
   *
   * The admin account alone - see DELETE_ROLES. This page is open to the whole
   * back office and is almost entirely a read; the delete is the one write on
   * it, and it is narrower than the page. A manager reading the lab record gets
   * the record, which is what a desk is for. Taking a row out of it moves stock
   * in the yard and nothing here puts it back, so it sits with the account that
   * owns the irreversible half.
   */
  const mayRemove = useAppSelector((s) =>
    s.auth.user ? DELETE_ROLES.includes(s.auth.user.role) : false,
  );

  const [days, setDays] = useState(30);
  const [grade, setGrade] = useState('');
  const [verdict, setVerdict] = useState('');
  const [openBatch, setOpenBatch] = useState<Batch | null>(null);
  /**
   * Which test is one tap from being deleted, and which is being deleted.
   *
   * One id rather than a flag per row, so arming a second row disarms the
   * first - the same two-step the run delete uses. A delete moves stock in the
   * yard and there is no undo behind it, so it is not a single tap.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /** `null` is the whole record - see WINDOWS. */
  const from = useMemo(() => (days ? lastNDays(days).from : null), [days]);

  useEffect(() => {
    void dispatch(fetchQualityRecord({ from }));
  }, [dispatch, from, refreshTick]);

  /*
   * Still fetched, and deliberately not merged with the read above: this is what
   * keeps `held` current for Dispatch's warning and the bench's tab badge, and
   * it is a different set of batches by design.
   */
  useEffect(() => {
    void dispatch(fetchPendingQuality());
  }, [dispatch, refreshTick]);

  useEffect(() => {
    void dispatch(fetchQualitySummary(days ? lastNDays(days) : {}));
  }, [dispatch, days, refreshTick]);

  /** Every test in the window, before the grade and verdict picks narrow it. */
  const inWindow = useMemo(
    () => (from ? tests.filter((t) => (testedAt(t) ?? '').slice(0, 10) >= from) : tests),
    [tests, from],
  );

  const rows = useMemo(
    () =>
      [...inWindow]
        .filter((t) => (!grade || t.grade === grade) && (!verdict || t.verdict === verdict))
        .sort(byNewest),
    [inWindow, grade, verdict],
  );

  const totals = useMemo(() => {
    const hold = inWindow.filter((t) => t.verdict === 'hold').length;
    const reports = inWindow.filter((t) => t.attachment_url).length;
    return { tests: inWindow.length, hold, pass: inWindow.length - hold, reports };
  }, [inWindow]);

  /**
   * Every batch charged in the window with where its grades stand, the worrying
   * ones first.
   *
   * Open and closed alike. Whether a batch is still open says nothing about
   * whether the lab has seen it, and reading only the open ones is what let a
   * charge be produced, weighed, closed and never checked without appearing on
   * this page at all.
   *
   * `perGrade` is false for a coarse or DRC charge. Those are not marked or
   * certified grade by grade - coarse is sampled as a ten-day pool in the yard -
   * so batchQc's fallback of "every grade, all untested" would invent six
   * verdicts nobody owes. They are listed, because they were produced and the
   * question is what has been produced, and the card says where their verdict
   * actually lives instead of showing a made-up one.
   */
  const cards = useMemo(() => {
    const opened = (b: Batch) => (b.opened_at ?? b.shift_date ?? '').slice(0, 10);
    return batches
      .filter((b) => !from || opened(b) >= from)
      .map((batch) => ({ batch, qc: batchQc(batch, tests), perGrade: batch.line === 'special' }))
      .sort(
        (a, b) =>
          Number(a.perGrade ? attention(a.qc) : 3) - Number(b.perGrade ? attention(b.qc) : 3) ||
          (b.batch.opened_at ?? '').localeCompare(a.batch.opened_at ?? ''),
      );
  }, [batches, tests, from]);

  const graded = cards.filter(({ perGrade }) => perGrade);
  const untestedBatches = graded.filter(({ qc }) => !qc.allDone).length;
  const heldBatches = graded.filter(({ qc }) => qc.anyHold).length;
  const closedUntested = graded.filter(
    ({ batch, qc }) => batch.status === 'closed' && !qc.allDone,
  ).length;
  const poolCharges = cards.length - graded.length;

  /**
   * Take a test off the record, and say what it moved in the yard.
   *
   * The thunk bumps the refresh tick, so a Stock view open in another tab
   * re-reads itself rather than going on drawing the verdict this row was
   * carrying.
   */
  const remove = async (test: QualityTest) => {
    setRemoving(test.id);
    const done = await dispatch(removeTest(test.id));
    setRemoving(null);
    setConfirming(null);
    if (!removeTest.fulfilled.match(done)) {
      notify(`Could not remove the ${test.grade} verdict on ${test.batch_no ?? 'this batch'}`, 'err');
      return;
    }
    notify(`${test.batch_no ?? 'Test'} · ${test.grade} removed — ${removedText(done.payload)}`, 'ok');
  };

  /**
   * The two-step control, wherever a test is listed.
   *
   * Written once because the same test is reachable from the batch it was filed
   * against and from the window's list of verdicts, and a delete that behaved
   * differently depending on which screen it was pressed from would be two
   * controls wearing one name.
   *
   * Nothing at all for an account that may not delete, rather than a dead
   * button. The whole page is a manager's to read and this is the only control
   * on it - a Delete that can never move on any row of it would be furniture,
   * not an answer.
   */
  const deleteControl = (test: QualityTest) =>
    !mayRemove ? null : confirming === test.id ? (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn danger"
          onClick={() => void remove(test)}
          disabled={removing === test.id}
        >
          {removing === test.id ? 'Removing…' : 'Yes, remove it'}
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(null)}>
          Cancel
        </button>
      </span>
    ) : (
      <button
        type="button"
        className="btn"
        onClick={() => setConfirming(test.id)}
        title="Take this test off the record and put the stock it released back"
      >
        Remove
      </button>
    );

  /** One batch on its own: each grade, and every test ever filed against it. */
  if (openBatch) {
    const qc = cards.find((c) => c.batch.id === openBatch.id)?.qc ?? batchQc(openBatch, tests);
    const history = tests.filter((t) => String(t.batch_no ?? t.batch_id) === String(openBatch.ref));

    return (
      <>
        <button type="button" className="back" onClick={() => setOpenBatch(null)}>
          ‹ Back to quality
        </button>

        <div className="panel">
          <div className="row">
            <div>
              <h1 className="text-lg">
                <span className="batchref">{openBatch.ref}</span>
              </h1>
              <div className="sub">
                {[
                  openBatch.machine_id,
                  openBatch.formulation,
                  openBatch.opened_at && `charged ${dayMonth(openBatch.opened_at)}`,
                  openBatch.shift_date && dayLong(openBatch.shift_date),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <span className={`badge ${qc.anyHold ? 'hot' : qc.allDone ? 'ok' : 'none'}`}>
              {batchQcChip(qc).label}
            </span>
          </div>
        </div>

        <div className="grouphead">Where each grade stands</div>
        {qc.grades.map(({ grade: g, test }) => (
          <div key={g} className="mrow">
            <div>
              <div className="mn">
                <span className="qchip">{g}</span>
              </div>
              <div className="mk">
                {test
                  ? `${testerOf(test)} · ${dayMonth(testedAt(test))} · ${test.params?.length ?? 0} readings`
                  : 'no test on file'}
              </div>
            </div>
            <span className={`badge ${test ? verdictBadge(test.verdict) : 'none'}`}>
              {test ? (test.verdict === 'hold' ? 'hold' : 'pass') : 'untested'}
            </span>
          </div>
        ))}

        <div className="grouphead">Every test filed against this batch</div>
        {!history.length && <div className="empty">No tests on file for this batch.</div>}
        {[...history].sort(byNewest).map((test) => (
          <div key={test.id} className="runcard">
            <div className="top">
              <span className="ttl">
                <span className="qchip">{test.grade}</span>{' '}
                <span className={`badge ${verdictBadge(test.verdict)}`}>
                  {test.verdict === 'hold' ? 'hold' : 'pass'}
                </span>
              </span>
              <span className="when">
                {dayMonth(testedAt(test))} · {testerOf(test)}
              </span>
            </div>
            {(test.params?.length ?? 0) > 0 && (
              <div className="params">
                {test.params?.map((p) => (
                  <span key={p.name} className="chiplet">
                    <b>{p.name}</b> {p.value}
                    {p.unit ? ` ${p.unit}` : ''}
                  </span>
                ))}
              </div>
            )}
            {remarkOf(test) && <div className="sub mt-2">{remarkOf(test)}</div>}
            <div className="row mt-2 items-center justify-between gap-2">
              {test.attachment_url ? (
                <a
                  href={test.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--elec)' }}
                >
                  {test.attachment_name || 'lab report'} ↗
                </a>
              ) : (
                <span className="muted text-[11px]">no report on file</span>
              )}
              {deleteControl(test)}
            </div>
            {/* Said beside the armed button rather than only in the toast
                afterwards: what this moves is stock in the yard, and that is
                the part somebody at a desk is least likely to have in mind. */}
            {confirming === test.id && (
              <div className="sub mt-2">
                Removing this puts the stock it released back where the tests
                that remain leave it — the verdict before this one, or awaiting
                the lab if this was the only one.
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="bar">
          <div className="f">
            <label htmlFor="q-window">Window</label>
            <select id="q-window" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.days} value={w.days}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="q-grade">Grade</label>
            <select id="q-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">All grades</option>
              {QUALITIES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="q-verdict">Verdict</label>
            <select id="q-verdict" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="">Pass and hold</option>
              <option value="pass">Pass only</option>
              <option value="hold">Hold only</option>
            </select>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{totals.tests}</b>
            <span>tests filed</span>
          </div>
          <div className="kpi">
            <b style={totals.hold ? { color: 'var(--err)' } : undefined}>{totals.hold}</b>
            <span>held</span>
          </div>
          <div className="kpi">
            <b>{totals.tests ? `${Math.round((totals.pass / totals.tests) * 100)}%` : '—'}</b>
            <span>pass rate</span>
          </div>
          <div className="kpi">
            <b>{totals.reports}</b>
            <span>with report</span>
          </div>
        </div>

        <div className="sub mt-3">
          {from ? `${dayLong(from)} – ${dayLong(todayISO())}` : 'Everything on record'} · verdicts
          are filed at the bench, on the shop-floor Quality tab, so this page reads them rather
          than records them.
        </div>
        <div className="sub mt-1">
          Every batch charged in the window is listed, open or closed — a batch closes when its
          grades are weighed, which is not the same as the lab having seen it. Anything the lab has
          not reached reads <b>Not checked</b>.
        </div>
      </div>

      {error && <div className="errbox">{error}</div>}
      {(loading || recordLoading) && !tests.length && (
        <div className="spin">Loading the lab record…</div>
      )}

      <div className="grouphead">Pass rate by grade</div>
      {!summary.length ? (
        <div className="empty">No tests in this window.</div>
      ) : (
        <div className="panel scroll-x">
          <table className="tt min-w-[420px]">
            <thead>
              <tr>
                <th>Grade</th>
                <th className="tnum">Tests</th>
                <th className="tnum">Pass</th>
                <th className="tnum">Hold</th>
                <th className="tnum">Pass rate</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.grade}>
                  <td>
                    <span className="qchip">{row.grade}</span>
                  </td>
                  <td className="tnum">{row.total}</td>
                  <td className="tnum">{row.pass}</td>
                  <td className="tnum" style={row.hold ? { color: 'var(--err)' } : undefined}>
                    {row.hold}
                  </td>
                  <td className="tnum" style={{ color: row.passRate >= 90 ? 'var(--ok)' : 'var(--warn)' }}>
                    {row.passRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grouphead">
        Batches charged
        <span className="muted ml-2 text-[11px] font-normal">
          {cards.length} in this window · {heldBatches} held · {untestedBatches} not checked
          {closedUntested > 0 ? ` (${closedUntested} of them already closed)` : ''}
          {poolCharges > 0 ? ` · ${poolCharges} sampled as pools` : ''}
        </span>
      </div>
      {record.truncated && (
        <div className="sub mb-2" style={{ color: 'var(--err)' }}>
          There is more on record than this page will fetch in one go. Narrow the window — what is
          shown below is the newest part of it, not all of it.
        </div>
      )}
      {!cards.length ? (
        <div className="empty">Nothing was charged in this window.</div>
      ) : (
        cards.map(({ batch, qc, perGrade }) => {
          const chip = batchQcChip(qc);
          return (
            <button
              key={batch.id}
              type="button"
              className="mrow"
              onClick={() => setOpenBatch(batch)}
            >
              <div>
                <div className="mn">
                  <span className="batchref">{batch.ref}</span>
                  {batch.formulation ? <span className="muted"> · {batch.formulation}</span> : ''}
                  {/*
                    Said on the row rather than left to be inferred. The whole
                    point of listing closed batches is that closed and checked
                    are different things, and a row that does not say which is
                    which puts the reader back to guessing.
                  */}
                  {batch.status === 'closed' && (
                    <span className="muted text-[11px]"> · closed</span>
                  )}
                </div>
                <div className="mk">
                  {[
                    batch.machine_id,
                    batch.opened_at && `charged ${dayMonth(batch.opened_at)}`,
                    perGrade
                      ? `${qc.pass}/${qc.grades.length} passed`
                      : `${batch.line ?? 'other'} charge — sampled as a pool in the yard`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="row gap-2">
                {perGrade ? (
                  <span
                    className={cn('badge', chip.tone === 'hold' && 'hot', chip.tone === 'ok' && 'ok',
                      chip.tone === 'part' && 'warn', chip.tone === 'none' && 'none')}
                  >
                    {chip.label}
                  </span>
                ) : (
                  <span className="badge none">Not checked here</span>
                )}
                <span className="chev">›</span>
              </div>
            </button>
          );
        })
      )}

      <div className="grouphead">
        Verdicts
        <span className="muted ml-2 text-[11px] font-normal">{rows.length} on file</span>
      </div>
      {!rows.length ? (
        <div className="empty">No verdicts match these filters.</div>
      ) : (
        <div className="panel scroll-x">
          <table className="tt min-w-[720px]">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Grade</th>
                <th>Verdict</th>
                <th>Tested by</th>
                <th>When</th>
                <th>Readings</th>
                <th>Report</th>
                {/* The whole window rather than one batch, which is where a
                    verdict filed against the wrong batch is actually spotted -
                    it does not appear under the batch it was meant for. Dropped
                    entirely for an account that cannot delete, rather than left
                    as an empty column with nothing that will ever be in it. */}
                {mayRemove && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((test) => (
                <tr key={test.id}>
                  <td>
                    <span className="batchref">{test.batch_no ?? '—'}</span>
                  </td>
                  <td>
                    <span className="qchip">{test.grade}</span>
                  </td>
                  <td>
                    <span className={`badge ${verdictBadge(test.verdict)}`}>
                      {test.verdict === 'hold' ? 'hold' : 'pass'}
                    </span>
                  </td>
                  <td>{testerOf(test)}</td>
                  <td>{dayMonth(testedAt(test))}</td>
                  <td className="tnum">{test.params?.length ?? 0}</td>
                  <td>
                    {test.attachment_url ? (
                      <a
                        href={test.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--elec)' }}
                      >
                        view ↗
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  {mayRemove && <td>{deleteControl(test)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default AdminQualityPage;
