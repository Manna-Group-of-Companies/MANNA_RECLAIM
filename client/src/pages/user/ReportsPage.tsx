import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchProduction } from '@/features/reports/reportsSlice';
import { fetchQualitySummary } from '@/features/quality/qualitySlice';
import { PageLoader, QualityChip, StatTile, ViewHead } from '@/components/ui';
import { lastNDays } from '@/utils/date';
import { num } from '@/utils/format';

/** Production headline for the last seven days, plus the lab's pass rates. */
export function ReportsPage() {
  const dispatch = useAppDispatch();
  const production = useAppSelector((s) => s.reports.production);
  const summary = useAppSelector((s) => s.quality.summary);

  useEffect(() => {
    const window = lastNDays(7);
    void dispatch(fetchProduction(window));
    void dispatch(fetchQualitySummary(window));
  }, [dispatch]);

  if (!production) return <PageLoader label="Building report" />;

  return (
    <>
      <ViewHead title="Reports" meta="last 7 days" />

      <div className="statgrid">
        <StatTile label="Output" value={num(production.outKg, 0)} unit="kg" />
        <StatTile label="Runs" value={production.runs} />
        <StatTile label="Run hours" value={num(production.runHours)} unit="h" />
        <StatTile label="Rate" value={num(production.kgPerHour)} unit="kg/h" />
        <StatTile label="Energy" value={num(production.kwh, 0)} unit="kWh" />
        <StatTile label="Firewood" value={num(production.firewoodKg, 0)} unit="kg" />
      </div>

      {summary.length > 0 && (
        <>
          <div className="msec">
            <b>QC pass rate</b>
            <div className="ln" />
          </div>
          <div className="panel">
            {summary.map((row) => (
              <div key={row.grade} className="wq">
                <QualityChip quality={row.grade} />
                <div className="wbar">
                  <i
                    style={{
                      width: `${row.passRate}%`,
                      background: row.passRate >= 90 ? 'var(--ok)' : 'var(--warn)',
                    }}
                  />
                </div>
                <span className="val">
                  {row.passRate}% <span className="muted">/{row.total}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default ReportsPage;
