import type { UpdateRunPayload } from '@/api/services/run.service';
import type { Run } from '@/types/models';

/**
 * The arithmetic behind a run correction, shared by the two History tabs.
 *
 * Both screens edit the same record and have to reach the same figures - the
 * back office in its modal, the shop floor in a sheet - so what a correction
 * works out and what it sends lives here, and each page only decides how it
 * looks.
 */

export const text = (value: unknown) => (value == null ? '' : String(value));

export const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** The editable fields of a run, as a form holds them: everything a string. */
export const draftOf = (run: Run) => ({
  batchNo: text(run.batch_no),
  formulation: text(run.formulation),
  quality: text(run.quality),
  shiftDate: text(run.shift_date),
  shift: text(run.shift),
  supervisor: text(run.supervisor),
  workers: text(run.workers),
  elecStart: text(run.elec_start),
  elecEnd: text(run.elec_end),
  kwh: text(run.kwh),
  hourStart: text(run.hour_start),
  hourEnd: text(run.hour_end),
  hoursRun: text(run.hours_run),
  outWeight: text(run.weight_kg ?? run.out_weight),
  firewoodKg: text(run.firewood_kg),
  capacity: text(run.capacity),
  packedSacks: text(run.packed_sacks),
  remarks: text(run.remarks),
  // A press run. Its compound rate is not here on purpose: that is what the
  // product cost when this was moulded, not a figure to correct afterwards.
  pieces: text(run.pieces),
  flashKg: text(run.flash_kg),
  cavities: text(run.cavities),
  cyclicMin: text(run.cyclic_min),
});

export type Draft = ReturnType<typeof draftOf>;
export type DraftField = keyof Draft;

/** Which fields the form has actually moved off the run as it stands. */
export const changedFields = (draft: Draft, base: Draft) =>
  (Object.keys(base) as DraftField[]).filter((f) => draft[f] !== base[f]);

export interface RunMath {
  /** Soorya reads off a TOD meter showing one phase, so its energy is ×3. */
  isTod: boolean;
  isAuto: boolean;
  /** A moulding press: no meters, no hours - pieces, weight and flash. */
  isPress: boolean;
  /** Compound on the weight plus the flash, and that over the pieces made. */
  material: number | null;
  perPiece: number | null;
  elecStart: number | null;
  elecEnd: number | null;
  hourStart: number | null;
  hourEnd: number | null;
  elecPair: boolean;
  hourPair: boolean;
  elecDelta: number | null;
  hourDelta: number | null;
  /** What the run will read once saved, on the server's order of preference. */
  energy: number | null;
  runHours: number | null;
  output: number | null;
  /** Readings that cannot be right, in the words the screen shows them in. */
  issues: string[];
}

export function runMath(run: Run, draft: Draft): RunMath {
  const isTod = run.machine_id === 'GRD_O';
  const elecStart = asNumber(draft.elecStart);
  const elecEnd = asNumber(draft.elecEnd);
  const hourStart = asNumber(draft.hourStart);
  const hourEnd = asNumber(draft.hourEnd);
  const elecDelta = elecStart != null && elecEnd != null ? round2(elecEnd - elecStart) : null;
  const hourDelta = hourStart != null && hourEnd != null ? round2(hourEnd - hourStart) : null;
  const elecPair = elecDelta != null;
  const hourPair = hourDelta != null;

  // A press run re-costs itself as it is corrected: material follows the weight
  // and the flash, at the rate the run was moulded under, and cost per piece
  // follows the count. The rate itself is not editable, so it comes off the run.
  const isPress = run.kind === 'press';
  const rate = run.compound_rate != null ? Number(run.compound_rate) : null;
  const charged = round2((asNumber(draft.outWeight) ?? 0) + (asNumber(draft.flashKg) ?? 0));
  const material = isPress && rate != null && charged > 0 ? round2(rate * charged) : null;
  const pieces = asNumber(draft.pieces);
  const perPiece = material != null && pieces != null && pieces > 0 ? round2(material / pieces) : null;

  const issues: string[] = [];
  if (elecDelta != null && elecDelta < 0) {
    issues.push('The electricity meter reads lower at the end than at the start.');
  }
  if (hourDelta != null && hourDelta < 0) {
    issues.push('The hour meter reads lower at the end than at the start.');
  }
  if (isPress && pieces != null && pieces <= 0) {
    issues.push('A press run that made no pieces has nothing to cost.');
  }

  return {
    isTod,
    isAuto: run.kind === 'autoclave',
    isPress,
    material,
    perPiece,
    elecStart,
    elecEnd,
    hourStart,
    hourEnd,
    elecPair,
    hourPair,
    elecDelta,
    hourDelta,
    energy: elecDelta != null ? round2(isTod ? elecDelta * 3 : elecDelta) : asNumber(draft.kwh),
    runHours: hourDelta ?? asNumber(draft.hoursRun),
    output: asNumber(draft.outWeight),
    issues,
  };
}

/**
 * The patch a correction sends: only the fields that moved, each in the shape
 * the API takes them.
 *
 * A complete meter pair is the authority on its own figure, so the direct kWh
 * and hours boxes are left out rather than fighting the readings - the server
 * re-derives both from whichever readings changed.
 */
export function buildPayload(draft: Draft, changed: DraftField[], math: RunMath): UpdateRunPayload {
  const payload: UpdateRunPayload = {};
  for (const field of changed) {
    switch (field) {
      case 'batchNo':
      case 'formulation':
      case 'supervisor':
      case 'remarks':
        payload[field] = draft[field].trim() || null;
        break;
      case 'quality':
        payload.quality = (draft.quality || null) as Run['quality'];
        break;
      case 'shift':
        if (draft.shift) payload.shift = draft.shift as Run['shift'];
        break;
      case 'shiftDate':
        if (draft.shiftDate) payload.shiftDate = draft.shiftDate;
        break;
      default:
        payload[field] = asNumber(draft[field]);
    }
  }
  if (math.elecPair) delete payload.kwh;
  if (math.hourPair) delete payload.hoursRun;
  return payload;
}
