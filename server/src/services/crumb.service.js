import { runHours, runKwh } from './efficiency.service.js';
import { GRINDER_IDS, CRUMB_RATE_KEYS } from '../config/constants.js';

/**
 * What a kilogram of the plant's own crumb costs to make.
 *
 * The grinding line is the front of the plant. Scrap tyres are picked out of
 * the yard by hand, cracked, and ground down to crumb; the crumb is then
 * charged into an autoclave, and what comes out of the autoclave is reclaim.
 * So every rupee the grinding line spends is a rupee in the reclaim, and the
 * only honest way to say so is to work the line's cost out per kg of crumb and
 * charge the autoclave with it.
 *
 * Two halves make the figure:
 *
 *   material  the rubber itself, at the crumb rate the Rates tab holds for the
 *             feedstock it was made from - truck tyre or bike tyre. Weighted by
 *             the kg the window actually made of each, so a month that ran
 *             mostly bike does not get costed as though it ran truck.
 *   works     what the line spent turning that rubber into crumb: electricity
 *             off the meters, the crews on the cracker and the grinders, and
 *             the picking gang. Divided by the crumb the window weighed.
 *
 * Picking is in the works half and nowhere else, which is the point. It is the
 * gang that pulls scrap tyres out of the yard and feeds the cracker - upstream
 * of everything, and until now recorded nowhere. Put a man more on picking, or
 * keep the same gang there two hours longer, and the works half rises, so the
 * crumb rate rises, so the autoclave charge costs more, so the reclaim costs
 * more. Nobody has to remember to add it anywhere: it is not a bucket beside
 * the cost of reclaim, it is inside the price of the crumb.
 *
 * (Loading is the mirror case and deliberately does not work this way. It
 * happens to goods that already exist, so it can never be part of what they
 * cost to make - see the note at the top of loading.service.js.)
 *
 * Nothing here is snapshotted. A loading job's rates are frozen onto the entry
 * because the entry is a record of a job that was paid for; this is not a
 * record of anything, it is an average over a window that gets asked for again
 * with different edges every time the back office moves the date chips. It is
 * priced at today's rates on every read, like every other line of the Costing
 * tab, and a run corrected in History re-prices the window it was in.
 */

const num = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const per = (cost, kg) => (kg > 0 ? round4(cost / kg) : null);

/** Every run on the grinding line - the cracker included, which is the point. */
export const isGrindingLine = (row) =>
  row.line === 'grind' || GRINDER_IDS.includes(row.machine_id);

/**
 * The rate a run's crumb is costed at in rubber.
 *
 * A grinding run says which feedstock it was fed - `tyre_type` is picked as the
 * machine starts - and each feedstock has its own rate. A run recorded before
 * anyone was asked the question falls back to the truck rate: truck is what the
 * line runs on unless somebody says otherwise, and a blank costed at zero would
 * quietly report the plant making crumb out of nothing.
 */
export const crumbRateFor = (tyreType, rates = {}) => {
  const key = CRUMB_RATE_KEYS[String(tyreType ?? '').toLowerCase()] ?? CRUMB_RATE_KEYS.truck;
  return num(rates[key]);
};

/**
 * Labourer-hours of picking on a run: how many were on it, times how long they
 * were at it.
 *
 * Both halves have to be there. A gang with no hours against it, or hours with
 * nobody against them, is half an answer - and half an answer multiplied out is
 * zero, which reads exactly like a shift that did no picking at all.
 */
export const pickingHoursOf = (row) => {
  const labourers = num(row?.pickcut_workers);
  const hours = num(row?.pickcut_hours);
  return labourers > 0 && hours > 0 ? labourers * hours : 0;
};

/** Labourer-hours the machine's own crew worked: the crew, times the run. */
const crewHoursOf = (row) => {
  const crew = num(row.workers);
  const hours = num(runHours(row));
  return crew > 0 && hours > 0 ? crew * hours : 0;
};

/**
 * The whole figure, off a set of grinding-line runs and the rates in force.
 *
 * Pure, and exported for its own sake: this is the arithmetic the Costing tab
 * shows its working for, and it is worth being able to assert on it without a
 * database in the way.
 */
export function crumbCost(rows = [], rates = {}) {
  const line = rows.filter(isGrindingLine);

  const kwhRate = num(rates.grinderKwhRate) || num(rates.refinerKwhRate);
  const labourRate = num(rates.pickingLabourPerHour) || num(rates.loadingLabourPerHour);

  let crumbKg = 0;
  let kwh = 0;
  let crewHours = 0;
  let pickHours = 0;
  let materialCost = 0;
  const feedstock = new Map();
  const machines = new Map();

  for (const row of line) {
    const kg = Math.max(0, num(row.weight_kg));
    const energy = Math.max(0, num(runKwh(row)));
    const crew = crewHoursOf(row);
    const picked = pickingHoursOf(row);

    crumbKg += kg;
    kwh += energy;
    crewHours += crew;
    pickHours += picked;

    // The rubber is costed where it was weighed, at the rate of the feedstock
    // that run was fed. The cracker weighs nothing - what it cracks is weighed
    // downstream at the grinders - so it adds no rubber here and would double
    // count the whole line's material if it did.
    if (kg > 0) {
      const type = row.tyre_type ?? null;
      const rate = crumbRateFor(type, rates);
      materialCost += kg * rate;
      const seen = feedstock.get(type) ?? { tyre_type: type, kg: 0, rate };
      seen.kg += kg;
      feedstock.set(type, seen);
    }

    const id = row.machine_id ?? '?';
    const m = machines.get(id) ?? {
      machineId: id,
      machine: row.machine ?? id,
      runs: 0,
      crumbKg: 0,
      kwh: 0,
      crewHours: 0,
      pickingHours: 0,
    };
    m.runs += 1;
    m.crumbKg += kg;
    m.kwh += energy;
    m.crewHours += crew;
    m.pickingHours += picked;
    machines.set(id, m);
  }

  const energyCost = kwh * kwhRate;
  const crewCost = crewHours * labourRate;
  const pickingCost = pickHours * labourRate;
  const worksCost = energyCost + crewCost + pickingCost;

  return {
    runs: line.length,
    crumbKg: round2(crumbKg),

    // ---- the rubber ----
    feedstock: [...feedstock.values()]
      .map((f) => ({ ...f, kg: round2(f.kg), cost: round2(f.kg * f.rate) }))
      .sort((a, b) => b.kg - a.kg),
    materialCost: round2(materialCost),
    // Weighted by what the window made of each feedstock, not an average of the
    // rates: a month that ran nine parts truck to one part bike is a truck month.
    materialPerKg: per(materialCost, crumbKg),

    // ---- turning it into crumb ----
    kwh: round2(kwh),
    kwhRate,
    energyCost: round2(energyCost),
    labourRate,
    crewHours: round2(crewHours),
    crewCost: round2(crewCost),
    /**
     * The picking gang, stated on its own so the back office can see what it is
     * costing - and then added into the works below rather than left beside it.
     * Reported, not separated: `worksCost` already has it.
     */
    pickingHours: round2(pickHours),
    pickingCost: round2(pickingCost),
    pickingPerKg: per(pickingCost, crumbKg),
    worksCost: round2(worksCost),
    worksPerKg: per(worksCost, crumbKg),

    // ---- what a kg of crumb therefore costs ----
    perKg: crumbKg > 0 ? round4((materialCost + worksCost) / crumbKg) : null,

    machines: [...machines.values()]
      .map((m) => ({
        ...m,
        crumbKg: round2(m.crumbKg),
        kwh: round2(m.kwh),
        crewHours: round2(m.crewHours),
        pickingHours: round2(m.pickingHours),
        cost: round2(m.kwh * kwhRate + (m.crewHours + m.pickingHours) * labourRate),
      }))
      .sort((a, b) => b.cost - a.cost),

    /**
     * Whether the figure can be believed. A window with no crumb weighed has no
     * per-kg to report however much the line spent, and a window with no rates
     * behind it prices everything at nothing - both would otherwise come back as
     * a confident-looking zero.
     */
    priced: crumbKg > 0 && (kwhRate > 0 || labourRate > 0),
  };
}

/**
 * What the autoclaves were charged with in the window, and what that crumb cost.
 *
 * An autoclave run carries the vessel's charge as `capacity` - the same figure
 * the yield in the Efficiency tab is worked out against - and a charge is crumb
 * plus the small chemistry that goes in with it. It is taken as crumb here: the
 * chemicals are costed off their own rates on the Rates tab, and pretending a
 * 2200 kg charge is anything other than 2200 kg of rubber would understate the
 * one line the plant most wants to watch.
 */
export function autoclaveCharge(rows = [], perKg) {
  const loads = rows.filter((row) => row.kind === 'autoclave' || row.autoclave_id);
  const chargeKg = loads.reduce((total, row) => total + Math.max(0, num(row.capacity)), 0);
  return {
    loads: loads.length,
    chargeKg: round2(chargeKg),
    crumbCost: perKg == null ? null : round2(chargeKg * perKg),
  };
}

export default { crumbCost, autoclaveCharge, crumbRateFor, pickingHoursOf, isGrindingLine };
