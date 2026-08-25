import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { qualityService } from '@/api/services/quality.service';
import { toRequestError } from '@/api/axiosClient';
import { QC_PARAM_SUGGEST } from '@/config/constants';
import { dayLong, lastNDays } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { BatchQualityGrade, QualityByBatch } from '@/types/models';

/**
 * What the lab found, batch by batch and grade by grade.
 *
 * The grade is the unit rather than the batch, because that is how the plant
 * works: a charge goes into an autoclave under a number and comes off as several
 * grades, each tested on its own. Batch 2782 is on record as held on Fine and
 * held on Special, and either could have gone the other way.
 *
 * Worth writing down because the database disagrees. There is a `quality_latest`
 * view keyed on the batch without the grade, so it answers with whichever grade
 * happened to be tested last - a verdict under the wrong name. Nothing here
 * reads it.
 *
 * The readings are the point of the screen. The plant's test sheet is six
 * figures - Mooney, ash, acetone extract, tensile, elongation, hardness - and
 * the lab has been entering them in whatever order they came off the bench, so
 * batch to batch they never line up. Here they are put in one fixed order, which
 * is the difference between a list of numbers and a table somebody can read
 * down.
 */

const WINDOWS = [30, 90, 180];

/**
 * The order readings are shown in, whatever order they were entered in.
 *
 * QC_PARAM_SUGGEST is what the lab's own form offers, so it is the plant's
 * order rather than one invented here. Anything the lab typed that is not on
 * that list follows, in the order it was entered - a new test is a real thing
 * and dropping it to keep the table tidy would lose the reading entirely.
 */
const inSheetOrder = (readings: BatchQualityGrade['readings']) => {
  const rank = (name: string) => {
    const at = QC_PARAM_SUGGEST.indexOf(name);
    return at === -1 ? QC_PARAM_SUGGEST.length : at;
  };
  return [...readings].sort((a, b) => rank(a.name) - rank(b.name));
};

const VERDICT_TONE: Record<string, string> = {
  pass: 'ok',
  part: 'warn',
  hold: 'err',
};

const VERDICT_WORD: Record<string, string> = {
  pass: 'passed',
  part: 'part passed',
  hold: 'on hold',
};

/** One grade off one batch: where the lab left it, and what it measured. */
function Grade({ grade }: { grade: BatchQualityGrade }) {
  const readings = inSheetOrder(grade.readings);
  return (
    <div className={cn('effcard', grade.verdict !== 'pass' && 'flag')}>
      <div className="row">
        <div>
          <b>{grade.grade ?? 'The batch as a whole'}</b>
          <div className="muted text-[11px]">
            {grade.testedAt ? dayLong(grade.testedAt.slice(0, 10)) : 'not dated'}
            {grade.testedBy ? ` · ${grade.testedBy}` : ''}
            {/*
              Passed on the second go is a different fact from passed, and it is
              the kind an argument turns on later. Said only where it happened.
            */}
            {grade.tests > 1 && ` · tested ${grade.tests} times, held ${grade.held}`}
          </div>
        </div>
        <div className="cardaside">
          <span className={grade.verdict === 'pass' ? 'effhit' : 'effmiss'}>
            {grade.verdict === 'pass' ? 'passed' : 'on hold'}
          </span>
        </div>
      </div>

      {readings.length > 0 ? (
        <div className="scroll-x">
          <table className="tt min-w-[420px]">
            <thead>
              <tr>
                {readings.map((r) => (
                  <th key={r.name} className="tnum">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {readings.map((r) => (
                  <td key={r.name} className="tnum">
                    <b>{r.value}</b>
                    {r.unit ? <span className="muted"> {r.unit}</span> : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /*
         * A verdict with no figures behind it. Said as that rather than drawn as
         * an empty table: the lab does test, and what is missing is the writing
         * down, which is a different problem from a plant that does not test.
         */
        <div className="sub">No readings were entered against this test — the verdict only.</div>
      )}

      {grade.remarks && <div className="sub mt-1">{grade.remarks}</div>}
      {grade.reportUrl && (
        <a className="btn ghost block mt-2.5" href={grade.reportUrl} target="_blank" rel="noreferrer">
          Open the lab report
        </a>
      )}
    </div>
  );
}

export function BatchQualityBoard() {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [days, setDays] = useState(90);
  const [data, setData] = useState<QualityByBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await qualityService.byBatch(lastNDays(days)));
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const totals = data?.totals;
  /*
   * How much of the record carries figures. The headline rather than a footnote,
   * because the gap is the finding: the lab entered readings through July and
   * has entered none since, and a page that only showed verdicts would look
   * entirely healthy while that was true.
   */
  const documented = totals?.batches
    ? Math.round((totals.withReadings / totals.batches) * 100)
    : null;

  return (
    <>
      <div className="panel">
        <div className="chips">
          {WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              className={cn('chip', days === n && 'on')}
              onClick={() => setDays(n)}
            >
              Last {n} days
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{totals?.batches ?? 0}</b>
            <span>batches tested</span>
          </div>
          <div className="kpi">
            <b>{totals?.grades ?? 0}</b>
            <span>grades tested</span>
          </div>
          <div className="kpi">
            <b style={totals?.onHold ? { color: 'var(--err)' } : undefined}>{totals?.onHold ?? 0}</b>
            <span>not fully passed</span>
          </div>
          <div className="kpi">
            <b style={documented != null && documented < 100 ? { color: 'var(--warn)' } : undefined}>
              {documented == null ? '—' : `${documented}%`}
            </b>
            <span>carry readings</span>
          </div>
        </div>

        <div className="sub mt-2">
          What the lab found, by batch and then by grade — a charge is refined into several grades
          and each is tested on its own, so one batch can be passed on Special and held on Fine.
        </div>
        {documented != null && documented < 100 && (
          <div className="sub mt-1" style={{ color: 'var(--warn)' }}>
            {(totals?.batches ?? 0) - (totals?.withReadings ?? 0)} of {totals?.batches} batches
            carry a verdict with no measured figures behind it. The lab does test; what is missing
            is the writing down, and a verdict nobody can check is a verdict nobody can defend.
          </div>
        )}
      </div>

      {error && <div className="errbox">Couldn’t read the lab record: {error}</div>}
      {loading && <div className="spin">Reading the lab record…</div>}

      {!loading && !error && data && !data.batches.length && (
        <div className="empty">Nothing was tested in this period.</div>
      )}

      {!loading &&
        data?.batches.map((b) => (
          <div key={b.batch}>
            <div className="grouphead">
              Batch {b.batch} · {VERDICT_WORD[b.verdict]}
              {b.lastTested ? ` · ${dayLong(b.lastTested.slice(0, 10))}` : ''}
            </div>
            {/*
              A batch is only clear when every grade off it is: one grade on hold
              is stock that cannot go out, and a headline that read "passed"
              because most of it had would be the one sentence on this page
              somebody acts on wrongly.
            */}
            <div className={cn('sub mx-0.5 mb-2', `text-[var(--${VERDICT_TONE[b.verdict]})]`)}>
              {b.grades.length} grade{b.grades.length === 1 ? '' : 's'} tested
              {b.verdict === 'part' && ' — some clear, some not'}
            </div>
            {b.grades.map((g) => (
              <Grade key={`${b.batch}|${g.grade ?? ''}`} grade={g} />
            ))}
          </div>
        ))}

      {!loading && data && data.batches.length > 0 && (
        <div className="sub mx-0.5 mt-3">
          The lab keeps this record here for now. It is meant to go into SAP later, and the shape
          above — a batch, its grades, and the sheet of readings under each — is what will be
          handed across, so nothing recorded now is recorded in a form that has to be thrown away.
        </div>
      )}
    </>
  );
}

export default BatchQualityBoard;
