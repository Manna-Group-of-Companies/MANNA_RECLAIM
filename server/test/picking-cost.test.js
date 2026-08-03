import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { crumbCost, autoclaveCharge, crumbRateFor, pickingHoursOf } from '../src/services/crumb.service.js';
import { mergePatch, decorate } from '../src/services/run.service.js';

/**
 * Picking, and the path it takes to the cost of a kilogram of reclaim.
 *
 * Picking is the gang that pulls scrap tyres out of the yard by hand and feeds
 * them to the cracker. It is the first labour the plant spends on a kg of
 * reclaim and it used to be spent nowhere: no field asked for it, so a shift
 * that put four extra hands on the yard looked exactly as cheap as one that put
 * none. What is being defended here is that it now flows, unaided:
 *
 *   picking labourer-hours -> the grinding line's works cost
 *                          -> rupees per kg of crumb
 *                          -> what the autoclave charge cost
 *
 * The two ways to get this wrong are both tested for. Picking must not become a
 * bucket of its own that somebody has to remember to add - so the assertions are
 * on the crumb rate rising, not on a picking total existing. And it must not
 * turn up twice, which is what would happen if the cracker's kg were counted as
 * crumb: the cracker weighs nothing, its output is weighed downstream at the
 * grinders.
 */

const RATES = {
  crumbTruckPerKg: 20,
  crumbBikePerKg: 25,
  grinderKwhRate: 8,
  pickingLabourPerHour: 50,
};

/** A shift on the grinding line: the cracker, then a grinder that weighed. */
const cracker = (over = {}) => ({
  machine_id: 'CRK',
  machine: 'Cracker',
  line: 'grind',
  kind: 'grind',
  shift_date: '2026-08-01',
  shift: 'Day',
  workers: 2,
  hours_run: 10,
  kwh: 100,
  // The cracker weighs nothing - what it cracks is weighed at the grinders.
  weight_kg: null,
  ...over,
});

const grinder = (over = {}) => ({
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  line: 'grind',
  kind: 'grind',
  shift_date: '2026-08-01',
  shift: 'Day',
  tyre_type: 'truck',
  workers: 1,
  hours_run: 10,
  kwh: 200,
  weight_kg: 1000,
  ...over,
});

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

test('a kg of crumb is the rubber plus what the line spent making it', () => {
  const crumb = crumbCost([cracker(), grinder()], RATES);

  assert.equal(crumb.crumbKg, 1000, 'only the grinder weighed - the cracker has no output');
  assert.equal(crumb.materialCost, 20000, '1000 kg at the truck rate');
  assert.equal(crumb.energyCost, 2400, '300 kWh at ₹8');
  assert.equal(crumb.crewHours, 30, '2 × 10 h on the cracker + 1 × 10 h on the grinder');
  assert.equal(crumb.crewCost, 1500);
  assert.equal(crumb.pickingCost, 0, 'nobody was recorded on the yard');
  assert.equal(crumb.worksCost, 3900);
  assert.equal(crumb.perKg, 23.9, '(20000 + 3900) ÷ 1000');
});

test('putting a gang on the yard raises what a kg of crumb costs', () => {
  const without = crumbCost([cracker(), grinder()], RATES);
  const with4 = crumbCost([cracker({ pickcut_workers: 4, pickcut_hours: 6 }), grinder()], RATES);

  assert.equal(with4.pickingHours, 24, '4 labourers for about 6 hours');
  assert.equal(with4.pickingCost, 1200, '24 labourer-hours at ₹50');
  assert.equal(with4.pickingPerKg, 1.2);
  assert.equal(with4.perKg, 25.1, 'the crumb rate carries it: 23.90 + 1.20');
  assert.ok(with4.perKg > without.perKg, 'this is the whole point of the feature');

  // And it is *inside* the works half, not beside it. A picking figure that had
  // to be added on separately is exactly the hidden bucket this replaces.
  assert.equal(with4.worksCost, without.worksCost + 1200);
  assert.equal(
    Math.round((with4.materialCost + with4.worksCost) / with4.crumbKg * 100) / 100,
    with4.perKg,
    'perKg is the two halves and nothing else',
  );
});

test('the autoclave charge is costed at whatever the crumb rate has become', () => {
  const rows = [cracker({ pickcut_workers: 4, pickcut_hours: 6 }), grinder()];
  const crumb = crumbCost(rows, RATES);
  const loads = [
    { kind: 'autoclave', machine_id: 'AC_A', capacity: 2200 },
    { kind: 'autoclave', machine_id: 'AC_B', capacity: 2500 },
  ];

  const charge = autoclaveCharge([...rows, ...loads], crumb.perKg);
  assert.equal(charge.loads, 2);
  assert.equal(charge.chargeKg, 4700);
  assert.equal(charge.crumbCost, 117970, '4700 kg × ₹25.10');

  // The same charge, with nobody picking, is cheaper by exactly the gang.
  const quiet = crumbCost([cracker(), grinder()], RATES);
  const quietCharge = autoclaveCharge([...rows, ...loads], quiet.perKg);
  assert.equal(
    Math.round((charge.crumbCost - quietCharge.crumbCost) * 100) / 100,
    5640,
    '4700 kg × ₹1.20 of picking — the picking cost, spread over the crumb and read back off it',
  );
});

test('the crumb is costed at the rate of the feedstock it was made from', () => {
  const crumb = crumbCost(
    [grinder({ weight_kg: 1000 }), grinder({ machine_id: 'GRD_S', tyre_type: 'bike', weight_kg: 1000 })],
    RATES,
  );
  assert.equal(crumb.materialCost, 45000, '1000 truck at 20 + 1000 bike at 25');
  assert.equal(crumb.materialPerKg, 22.5, 'weighted by what was actually made of each');
  assert.equal(crumb.feedstock.length, 2);

  // A run recorded before anyone was asked which tyre it was fed falls back to
  // truck. Costing it at nothing would report crumb made out of thin air.
  assert.equal(crumbRateFor(null, RATES), 20);
  assert.equal(crumbRateFor('bike', RATES), 25);
});

test('half a picking entry costs nothing, and is not mistaken for a gang', () => {
  // Labourers with no hours against them, and hours with nobody against them.
  // Neither is work anybody did, and multiplying either out silently gives zero
  // - which reads exactly like a shift that did no picking at all.
  for (const half of [
    { pickcut_workers: 4, pickcut_hours: 0 },
    { pickcut_workers: 0, pickcut_hours: 6 },
    { pickcut_workers: 4 },
  ]) {
    assert.equal(pickingHoursOf(half), 0, JSON.stringify(half));
    const crumb = crumbCost([cracker(half), grinder()], RATES);
    assert.equal(crumb.pickingCost, 0);
    assert.equal(crumb.perKg, 23.9, 'the crumb rate does not move on half an answer');
  }
});

test('a window with no crumb weighed says so rather than reporting a rate', () => {
  // The cracker ran, the grinders did not. Real money was spent and there is
  // nothing to divide it by; a confident-looking zero would be worse than a gap.
  const crumb = crumbCost([cracker({ pickcut_workers: 3, pickcut_hours: 4 })], RATES);
  assert.equal(crumb.crumbKg, 0);
  assert.equal(crumb.perKg, null);
  assert.equal(crumb.priced, false);
  // 100 kWh at 8, 20 crew-hours at 50, 12 picking-hours at 50.
  assert.equal(crumb.worksCost, 2400, 'the cost is still reported, it simply has nothing to divide by');
  assert.equal(autoclaveCharge([{ kind: 'autoclave', capacity: 2200 }], crumb.perKg).crumbCost, null);
});

test('unpriced rates are a gap, not a free plant', () => {
  const crumb = crumbCost([cracker({ pickcut_workers: 4, pickcut_hours: 6 }), grinder()], {});
  assert.equal(crumb.priced, false, 'no rates saved means the figure cannot be believed');
  assert.equal(crumb.pickingHours, 24, 'the hours are still counted, so filling the rate in prices them');

  // The grinding line falls back to the refiner tariff where only that is set.
  const fallback = crumbCost([grinder()], { refinerKwhRate: 8, loadingLabourPerHour: 50 });
  assert.equal(fallback.kwhRate, 8);
  assert.equal(fallback.labourRate, 50);
});

test('only the grinding line is counted - the refiners are a different cost', () => {
  const refiner = { machine_id: 'R4', line: 'special', kind: 'refiner', workers: 3, hours_run: 8, kwh: 400, weight_kg: 1800 };
  const crumb = crumbCost([cracker(), grinder(), refiner], RATES);
  assert.equal(crumb.crumbKg, 1000, 'reclaim off R4 is not crumb going into the autoclave');
  assert.equal(crumb.runs, 2);
});

// ---------------------------------------------------------------------------
// Recording it on the shop floor
// ---------------------------------------------------------------------------

test('a cracker stopped twice in a shift keeps one gang, for the hours it worked', () => {
  // The grinding line keeps one record per machine per shift, so a cracker
  // stopped for a blockage and started again folds back into the same row. The
  // gang did not go home and get hired again: it is the most hands the shift
  // ever had at once, for as long as the starts of it add up to.
  const merged = mergePatch(
    { passes: 1, pickcut_workers: 4, pickcut_hours: 3, workers: 2 },
    { pickcut_workers: 4, pickcut_hours: 3 },
    { ended_at: '2026-08-01T20:30:00.000Z', pickcut_workers: 5, pickcut_hours: 2, workers: 2 },
  );
  assert.equal(merged.pickcut_workers, 5, 'the shift picked with the most hands it ever had');
  assert.equal(merged.pickcut_hours, 5, '3 h on the first start, 2 h on the second');
  assert.equal(merged.passes, 2);
});

test('a run states its picking under the names the screens use', () => {
  const row = decorate({ id: 'r1', machine_id: 'CRK', pickcut_workers: 4, pickcut_hours: 6.5 });
  assert.equal(row.picking_labourers, 4);
  assert.equal(row.picking_hours, 6.5);
  assert.equal(row.picking_labour_hours, 26, 'worked out once here, not in each screen');

  const none = decorate({ id: 'r2', machine_id: 'CRK' });
  assert.equal(none.picking_labour_hours, null, 'a shift nobody entered is not a shift nobody picked');
});

test('picking is recorded off the cracker, and ignored from anything else', async (t) => {
  const api = await startApi({
    tables: {
      machines: [
        { id: 'CRK', name: 'Cracker', kind: 'grind', enabled: true },
        { id: 'GRD_K', name: 'Grinder 1', kind: 'grind', enabled: true },
      ],
      runs: [
        {
          id: 'run-crk',
          machine_id: 'CRK',
          line: 'grind',
          kind: 'grind',
          shift_date: '2026-08-01',
          shift: 'Day',
          started_at: '2026-08-01T03:00:00.000Z',
          ended_at: null,
        },
        {
          id: 'run-grd',
          machine_id: 'GRD_K',
          line: 'grind',
          kind: 'grind',
          shift_date: '2026-08-01',
          shift: 'Day',
          started_at: '2026-08-01T03:00:00.000Z',
          ended_at: null,
        },
      ],
    },
  });
  t.after(() => api.stop());

  const picking = { pickingLabourers: 4, pickingHours: 6, hoursRun: 10, outWeight: 800 };

  const onCracker = await api.call('/runs/run-crk/stop', { method: 'POST', body: picking });
  const crk = (await onCracker.json()).data;
  assert.equal(onCracker.status, 200, JSON.stringify(crk));
  assert.equal(crk.picking_labourers, 4);
  assert.equal(crk.picking_labour_hours, 24);

  // The same sheet against a grinder. It is dropped rather than refused: the run
  // itself is fine, and a crew standing at a machine should not be arguing with
  // a form about a field their sheet should never have shown them.
  const onGrinder = await api.call('/runs/run-grd/stop', { method: 'POST', body: picking });
  const grd = (await onGrinder.json()).data;
  assert.equal(onGrinder.status, 200, JSON.stringify(grd));
  assert.equal(grd.picking_labourers, null, 'picking belongs to the cracker and nothing else');
  assert.equal(grd.weight_kg, 800, 'the rest of the sheet was still logged');
});
