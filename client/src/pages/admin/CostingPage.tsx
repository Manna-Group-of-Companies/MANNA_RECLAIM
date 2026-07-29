import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { fetchCostRates } from '@/features/rates/ratesSlice';
import { lockCosting, unlockCosting } from '@/features/ui/uiSlice';
import { SACK_KG } from '@/config/constants';
import { appEnv } from '@/config/env';
import { lastNDays, todayISO } from '@/utils/date';
import { num, rupees } from '@/utils/format';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/**
 * back.html's passcode gate. It is a screen, not a lock: the passcode ships in
 * the bundle, so what actually keeps the figures away from the shop floor is
 * the manager/admin check on the route and on the API. This stops the numbers
 * appearing on a shared screen in front of whoever happens to be standing
 * there, which is what the plant asked it for.
 */
function CostingLock() {
  const dispatch = useAppDispatch();
  const [entered, setEntered] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (entered === appEnv.costingPasscode) {
      dispatch(unlockCosting());
      return;
    }
    setWrong(true);
    setEntered('');
  };

  return (
    <form onSubmit={submit} className="panel mx-auto mt-8 max-w-[340px]">
      <div className="grouphead mt-0">🔒 Costing is locked</div>
      <div className="field">
        <label htmlFor="cost-pw">Enter password</label>
        <input
          id="cost-pw"
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="••••"
          value={entered}
          onChange={(e) => {
            setEntered(e.target.value);
            setWrong(false);
          }}
        />
      </div>
      {wrong && (
        <div className="errbox" role="alert">
          Wrong password.
        </div>
      )}
      <button type="submit" className="btn block mt-1">
        Unlock
      </button>
    </form>
  );
}

/**
 * Per-kg reclaim cost for a window, behind back.html's passcode.
 *
 * The prototype left this view as a placeholder. It is filled in here: the
 * plant figures come from the costing snapshots, and the rates the Rates tab
 * holds turn the window's output and firewood into money. Every line shows the
 * arithmetic, because a cost per kg nobody can check is a cost per kg nobody
 * will act on.
 */
export function CostingPage() {
  const dispatch = useAppDispatch();
  const { costing, production, loading } = useAppSelector((s) => s.reports);
  const costRates = useAppSelector((s) => s.rates.costRates);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const unlocked = useAppSelector((s) => s.ui.costingUnlocked);
  const [days, setDays] = useState(30);

  useEffect(() => {
    // Nothing is fetched while locked, so the figures are not sitting in the
    // page waiting to be read out of the network tab.
    if (!unlocked) return;
    void dispatch(fetchDashboard(lastNDays(days)));
    void dispatch(fetchCostRates());
  }, [dispatch, days, refreshTick, unlocked]);

  /**
   * The costed lines. Output drives the per-kg figures; monthly overheads are
   * apportioned across the window rather than charged whole to it.
   */
  const lines = useMemo(() => {
    if (!costing) return [];
    const rate = (key: string) => Number(costRates?.data?.[key] ?? 0);
    const outKg = costing.outputKg || production?.outKg || 0;
    const sacks = production?.packedSacks ?? 0;
    const firewoodKg = costing.firewoodKg ?? 0;
    const monthShare = days / 30;

    const rows = [
      {
        label: 'Conversion (electricity + labour)',
        amount: costing.conversionCost,
        working: `from the shift costing snapshots · electricity ${rupees(costing.electricityCost)} + labour ${rupees(costing.labourCost)}`,
      },
      {
        label: 'Firewood',
        amount: firewoodKg * rate('firewoodPerKg'),
        working: `${num(firewoodKg, 0)} kg × ${rupees(rate('firewoodPerKg'))}/kg`,
      },
      {
        label: 'Packing',
        amount: sacks * (rate('packLabourPerSack') + rate('packMaterialPerSack')),
        working: `${num(sacks, 0)} sacks × (${rupees(rate('packLabourPerSack'))} labour + ${rupees(rate('packMaterialPerSack'))} material) at ${SACK_KG} kg/sack`,
      },
      {
        label: 'Loading',
        amount: outKg * rate('loadingPerKg'),
        working: `${num(outKg, 0)} kg × ${rupees(rate('loadingPerKg'))}/kg`,
      },
      {
        label: 'Overheads (apportioned)',
        amount:
          (rate('ohFinancialPerMonth') + rate('ohManufacturingPerMonth') + rate('ohDepreciationPerMonth')) *
          monthShare,
        working: `monthly financial + manufacturing + depreciation × ${num(monthShare, 2)} of a month`,
      },
    ];

    return rows.map((r) => ({ ...r, perKg: outKg ? r.amount / outKg : null }));
  }, [costing, production, costRates, days]);

  const totals = useMemo(() => {
    const outKg = costing?.outputKg || production?.outKg || 0;
    const cost = lines.reduce((s, l) => s + (l.amount || 0), 0);
    const revenue = costing?.revenue ?? 0;
    return {
      outKg,
      cost,
      perKg: outKg ? cost / outKg : null,
      revenue,
      margin: revenue - cost,
    };
  }, [lines, costing, production]);

  const missingRates = !costRates || Object.values(costRates.data).every((v) => v == null);

  if (!unlocked) return <CostingLock />;

  return (
    <>
      <div className="row mx-0.5 mt-3 items-start">
        <div>
          <h1 className="text-lg">Costing</h1>
          <div className="sub">Per-kg reclaim cost, priced from the Rates tab.</div>
        </div>
        <button type="button" className="refresh" onClick={() => dispatch(lockCosting())}>
          🔒 Lock
        </button>
      </div>

      <div className="panel">
        <div className="chips">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              className={`chip${days === w.days ? ' on' : ''}`}
              onClick={() => setDays(w.days)}
            >
              Last {w.label}
            </button>
          ))}
        </div>
        <div className="sub mt-2.5">
          {lastNDays(days).from} → {todayISO()}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{num(totals.outKg, 0)}</b>
            <span>kg produced</span>
          </div>
          <div className="kpi">
            <b>{totals.perKg == null ? '—' : rupees(totals.perKg)}</b>
            <span>cost / kg</span>
          </div>
          <div className="kpi">
            <b>{rupees(totals.revenue)}</b>
            <span>dispatched value</span>
          </div>
        </div>
      </div>

      {missingRates && (
        <div className="errbox">
          No cost rates saved yet — the lines below are costed at zero. Fill them in on the Rates
          tab.
        </div>
      )}

      {loading && <div className="spin">Costing the window…</div>}

      {!loading && (
        <>
          <div className="grouphead">What it cost</div>
          <div className="panel mt-0 p-0">
            <table className="tt">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="tnum">Amount</th>
                  <th className="tnum">₹ / kg</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.label}>
                    <td>
                      {l.label}
                      <div className="muted text-[10px]">{l.working}</div>
                    </td>
                    <td className="tnum">{rupees(l.amount)}</td>
                    <td className="tnum">{l.perKg == null ? '—' : rupees(l.perKg)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="tnum">
                    <b>{rupees(totals.cost)}</b>
                  </td>
                  <td className="tnum">
                    <b>{totals.perKg == null ? '—' : rupees(totals.perKg)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grouphead">Against what went out</div>
          <div className="panel mt-0">
            <div className="roRow">
              <span className="k">Dispatched</span>
              <span className="v">
                {num(costing?.dispatchedKg ?? 0, 0)} kg · {rupees(costing?.revenue ?? 0)}
              </span>
            </div>
            <div className="roRow">
              <span className="k">Cost of that output</span>
              <span className="v">{rupees(totals.cost)}</span>
            </div>
            <div className="roRow">
              <span className="k">Difference</span>
              <span className="v" style={{ color: totals.margin >= 0 ? 'var(--ok)' : 'var(--err)' }}>
                {rupees(totals.margin)}
              </span>
            </div>
            <div className="sub mt-2">
              Production and dispatch are not the same kilos — material is made in one window and
              sold in another, so read the difference as a trend rather than a profit figure.
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default CostingPage;
