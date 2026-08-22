import type { ReactNode } from 'react';
import { useAppSelector } from '@/app/hooks';
import { num, rupees } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * The windows the overview offers. Anything longer is History's question.
 *
 * Not exported: a second export beside a component costs this file its fast
 * refresh, and both pages that use it pass their own `days` in anyway.
 */
const WINDOWS = [7, 30, 90];

export interface PlantSummaryProps {
  /** The window in days, held by the page because the page does the fetching. */
  days: number;
  onDays: (days: number) => void;
  /**
   * Rendered between the figures and the per-machine table - which is where the
   * back office puts what needs attention. The managing director's screen passes
   * nothing, because every row of that list is a link into a page it cannot open.
   */
  children?: ReactNode;
}

/**
 * What the plant made and what it cost, over a window.
 *
 * Lifted out of DashboardPage when the managing director's screen needed the
 * same two rows of figures and the same table. Both pages read the one
 * /reports/dashboard response, so this deliberately owns no fetching: the two
 * differ in what they are allowed to fetch alongside it, not in this.
 */
export function PlantSummary({ days, onDays, children }: PlantSummaryProps) {
  const { production, costing, efficiency, loading } = useAppSelector((s) => s.reports);

  return (
    <>
      <div className="panel">
        <div className="chips">
          {WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              className={cn('chip', days === d && 'on')}
              onClick={() => onDays(d)}
            >
              Last {d} days
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{num(production?.outKg ?? 0, 0)}</b>
            <span>kg out</span>
          </div>
          <div className="kpi">
            <b>{production?.runs ?? 0}</b>
            <span>runs</span>
          </div>
          <div className="kpi">
            <b>{num(production?.kgPerHour ?? 0)}</b>
            <span>kg / h</span>
          </div>
          <div className="kpi">
            <b>{num(production?.kwh ?? 0, 0)}</b>
            <span>kWh</span>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{costing?.autoclaveLoads ?? 0}</b>
            <span>autoclave loads</span>
          </div>
          <div className="kpi">
            <b>{rupees(costing?.conversionCost ?? 0)}</b>
            <span>conversion cost</span>
          </div>
          <div className="kpi">
            <b>{num(costing?.dispatchedKg ?? 0, 0)}</b>
            <span>kg dispatched</span>
          </div>
          <div className="kpi">
            <b>{rupees(costing?.revenue ?? 0)}</b>
            <span>dispatched value</span>
          </div>
        </div>
      </div>

      {children}

      {loading && <div className="spin">Loading plant data…</div>}

      <div className="grouphead">Output by machine</div>
      {!efficiency.length ? (
        <div className="empty">No runs in this window.</div>
      ) : (
        <div className="panel scroll-x mt-0 p-0">
          <table className="tt min-w-[480px]">
            <thead>
              <tr>
                <th>Machine</th>
                <th className="tnum">Runs</th>
                <th className="tnum">Hours</th>
                <th className="tnum">Out</th>
                <th className="tnum">kg / h</th>
              </tr>
            </thead>
            <tbody>
              {efficiency.map((row) => (
                <tr key={row.machineId}>
                  <td>{row.machine ?? row.machineId}</td>
                  <td className="tnum">{row.runs}</td>
                  <td className="tnum">{num(row.hours, 1)}</td>
                  <td className="tnum">{num(row.outKg, 0)} kg</td>
                  <td className="tnum">{num(row.kgPerHour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default PlantSummary;
