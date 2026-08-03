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

  /**
   * The grinding line, costed off its own runs rather than off a rate anybody
   * typed: what a kg of the plant's crumb cost to make, picking gang included.
   * It prices the charge going into the autoclaves - the first line of the
   * table below - and shows its working in its own panel further down.
   */
  const crumb = costing?.crumb ?? null;

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

    /*
     * The crumb the autoclaves ate, at what it cost the plant to make it.
     *
     * This is the front of the works: scrap tyres picked out of the yard by
     * hand, cracked, ground to crumb, charged into a vessel. The rate is not
     * typed in - it is the grinding line's own runs divided by the crumb they
     * weighed, so the rubber, the power, the crews and the picking gang are all
     * inside it. Put a man more on picking and this line moves on its own.
     *
     * The line's works cost then comes back out of the conversion line below.
     * Conversion is the whole plant's electricity and labour off the shift
     * snapshots, the grinding line included, and charging the same crew twice -
     * once inside the crumb and once beside it - would be the easiest possible
     * way to make this whole page wrong.
     *
     * If that subtraction ever goes past zero the two figures disagree about
     * what the grinding line spent - the snapshots are the database's, the crumb
     * is worked out here - and the line says so rather than quietly showing the
     * floor it was clamped to.
     */
    const crumbCost = crumb?.autoclave?.crumbCost ?? 0;
    const worksInCrumb = crumb?.worksCost ?? 0;
    const netConversion = costing.conversionCost - worksInCrumb;
    const conversionLessGrinding = Math.max(0, netConversion);

    const rows = [
      {
        label: 'Crumb into the autoclaves',
        amount: crumbCost,
        working: crumb?.priced
          ? `${num(crumb.autoclave.chargeKg, 0)} kg charged × ${rupees(crumb.perKg ?? 0)}/kg — rubber ${rupees(
              crumb.materialPerKg ?? 0,
            )} + the grinding line's own ${rupees(crumb.worksPerKg ?? 0)} (power, crews, picking)`
          : 'no crumb weighed in this window, or no grinding-line rates saved — see the Rates tab',
      },
      {
        label: 'Conversion (electricity + labour)',
        amount: conversionLessGrinding,
        working:
          netConversion < 0
            ? `the shift snapshots report ${rupees(costing.conversionCost)}, less than the ${rupees(
                worksInCrumb,
              )} the grinding line alone spent — the two disagree, so nothing is charged here`
            : `from the shift costing snapshots · electricity ${rupees(costing.electricityCost)} + labour ${rupees(
                costing.labourCost,
              )}${worksInCrumb ? `, less ${rupees(worksInCrumb)} already inside the crumb above` : ''}`,
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
      /*
       * Loading is deliberately absent from this list.
       *
       * It used to be here, as the window's output times a per-kg rate, and it
       * was wrong twice over. It charged a cost to serve against production,
       * and it repriced every past window the moment somebody edited the rate.
       *
       * The rupees-per-kg a batch carries is frozen when the batch consumes its
       * crumb. Loading happens afterwards, to goods that already exist, so it
       * joins at dispatch as a cost to serve beside transport - see the margin
       * on the customer's record, and loading.service.js on the server.
       *
       * Picking is the mirror case, and it is the crumb line at the top of this
       * list: upstream of everything, so it flows into rupees-per-kg crumb and
       * from there into the reclaim, rather than sitting out here as a bucket.
       */
      {
        label: 'Overheads (apportioned)',
        amount:
          (rate('ohFinancialPerMonth') + rate('ohManufacturingPerMonth') + rate('ohDepreciationPerMonth')) *
          monthShare,
        working: `monthly financial + manufacturing + depreciation × ${num(monthShare, 2)} of a month`,
      },
    ];

    return rows.map((r) => ({ ...r, perKg: outKg ? r.amount / outKg : null }));
  }, [costing, crumb, production, costRates, days]);

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
          <div className="panel scroll-x mt-0 p-0">
            <table className="tt min-w-[420px]">
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

          {/* ---- where the crumb rate came from ----
              The crumb line above is the biggest single thing on this page and
              the only one that is not a rate somebody typed, so it shows its
              working. Picking is on its own row not because it is a bucket -
              it is inside the works figure below it - but because it is the one
              cost here nobody could see before, and a manager watching the
              yard needs to be able to point at it. */}
          <div className="grouphead">What a kg of crumb cost</div>
          <div className="panel mt-0">
            {crumb == null || !crumb.priced ? (
              <div className="sub">
                {crumb == null || crumb.crumbKg <= 0
                  ? 'No crumb was weighed off the grinding line in this window, so there is no rate to work out.'
                  : 'The grinding line has no rates against it yet — fill in picking labour and grinding electricity on the Rates tab.'}
              </div>
            ) : (
              <>
                <div className="roRow">
                  <span className="k">Crumb made</span>
                  <span className="v">
                    {num(crumb.crumbKg, 0)} kg
                    <span className="muted"> · {crumb.runs} runs on the grinding line</span>
                  </span>
                </div>
                <div className="roRow">
                  <span className="k">Rubber</span>
                  <span className="v">
                    {rupees(crumb.materialCost)}
                    <span className="muted">
                      {' · '}
                      {crumb.feedstock.length
                        ? crumb.feedstock
                            .map(
                              (f) =>
                                `${num(f.kg, 0)} kg ${f.tyre_type ?? 'unstated'} at ${rupees(f.rate)}`,
                            )
                            .join(' + ')
                        : 'no feedstock recorded'}
                    </span>
                  </span>
                </div>
                <div className="roRow">
                  <span className="k">Electricity</span>
                  <span className="v">
                    {rupees(crumb.energyCost)}
                    <span className="muted">
                      {' · '}
                      {num(crumb.kwh, 0)} kWh at {rupees(crumb.kwhRate)}/kWh
                    </span>
                  </span>
                </div>
                <div className="roRow">
                  <span className="k">Cracker &amp; grinder crews</span>
                  <span className="v">
                    {rupees(crumb.crewCost)}
                    <span className="muted">
                      {' · '}
                      {num(crumb.crewHours, 0)} labourer-hours at {rupees(crumb.labourRate)}
                    </span>
                  </span>
                </div>
                <div className="roRow">
                  <span className="k">Picking (scrap yard)</span>
                  <span className="v">
                    {rupees(crumb.pickingCost)}
                    <span className="muted">
                      {' · '}
                      {crumb.pickingHours > 0
                        ? `${num(crumb.pickingHours, 0)} labourer-hours at ${rupees(crumb.labourRate)}`
                        : 'none recorded in this window'}
                    </span>
                  </span>
                </div>
                <div className="roRow">
                  <span className="k">
                    <b>Crumb rate</b>
                  </span>
                  <span className="v">
                    <b>{rupees(crumb.perKg ?? 0)}/kg</b>
                    <span className="muted">
                      {' · '}
                      rubber {rupees(crumb.materialPerKg ?? 0)} + works {rupees(crumb.worksPerKg ?? 0)}
                      {crumb.pickingPerKg ? `, of which picking ${rupees(crumb.pickingPerKg)}` : ''}
                    </span>
                  </span>
                </div>
                <div className="sub mt-2">
                  Picking is inside the works figure, not beside it. More hands on the yard, or the
                  same gang there longer, lifts the crumb rate — which lifts what the autoclave
                  charge cost, which lifts the cost of the reclaim. Nothing has to be added anywhere
                  for that to happen.
                </div>
              </>
            )}
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
