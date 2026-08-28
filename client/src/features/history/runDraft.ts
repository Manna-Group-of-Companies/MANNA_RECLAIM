import { CRACKER_IDS, isMoulding } from '@/config/constants';
import type { RemovedRun, UpdateRunPayload } from '@/api/services/run.service';
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
  /**
   * The batches mixed into this one, without the batch it is filed under -
   * `batchNo` above is that, and nothing is mixed into itself.
   *
   * A comma-joined string because a draft holds everything as text, which is
   * what lets changedFields() see it move like any other field. It is the one
   * field here that was never correctable: a mix could only be said as the
   * machine started, so a crew that put the second batch in ten minutes later
   * had nowhere to record it - and five runs in August have both numbers typed
   * into the batch box with a comma between them instead.
   */
  mix: (run.sources ?? []).slice(1).join(','),
  // A press run. Its compound rate is not here on purpose: that is what the
  // product cost when this was moulded, not a figure to correct afterwards.
  pieces: text(run.pieces),
  flashKg: text(run.flash_kg),
  cavities: text(run.cavities),
  cyclicMin: text(run.cyclic_min),
  // The picking gang on a cracker shift. Correctable because what the machine
  // recorded was a supervisor's estimate at the end of a long shift, and an
  // estimate is exactly the sort of thing remembered better the next morning.
  // Correcting it re-prices the crumb that window made - there is no stored
  // total behind it to go stale.
  pickingLabourers: text(run.picking_labourers),
  pickingHours: text(run.picking_hours),
});

export type Draft = ReturnType<typeof draftOf>;
export type DraftField = keyof Draft;

/** The mixed-in batches of a draft, as a list rather than as its text. */
export const mixList = (draft: Draft) =>
  draft.mix
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean)
    .filter((ref) => ref !== draft.batchNo.trim());

/** Which fields the form has actually moved off the run as it stands. */
export const changedFields = (draft: Draft, base: Draft) =>
  (Object.keys(base) as DraftField[]).filter((f) => draft[f] !== base[f]);

export interface RunMath {
  isAuto: boolean;
  /** A moulding press: no meters, no hours - pieces, weight and flash. */
  isPress: boolean;
  /** The cracker: the only machine that records the yard's picking gang. */
  isCracker: boolean;
  /** Labourer-hours of picking - what the crumb costing actually spends. */
  pickingLabourHours: number | null;
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
  //
  // A sleeve or loop run corrects the same way and is included here: it is
  // moulded against the same product, costed against the same compound rate,
  // and counted in the same pieces. What it does not do is take a corrected
  // product, date or shift - those three are its batch number, and moving it
  // would leave its boxed pieces standing in the yard under a lot that no longer
  // exists. The server refuses that outright; see run.service's edit().
  const isPress = run.kind === 'press' || isMoulding(run.kind);
  const rate = run.compound_rate != null ? Number(run.compound_rate) : null;
  const charged = round2((asNumber(draft.outWeight) ?? 0) + (asNumber(draft.flashKg) ?? 0));
  const material = isPress && rate != null && charged > 0 ? round2(rate * charged) : null;
  const pieces = asNumber(draft.pieces);
  const perPiece = material != null && pieces != null && pieces > 0 ? round2(material / pieces) : null;

  // The picking gang that fed the cracker, and what the crumb costing spends on
  // it. Both halves or neither: half an answer multiplied out is zero, which
  // reads exactly like a shift that did no picking.
  const isCracker = CRACKER_IDS.includes(run.machine_id);
  const pickLabourers = asNumber(draft.pickingLabourers);
  const pickHours = asNumber(draft.pickingHours);
  const pickingLabourHours =
    (pickLabourers ?? 0) > 0 && (pickHours ?? 0) > 0
      ? round2((pickLabourers as number) * (pickHours as number))
      : null;

  const issues: string[] = [];
  if (elecDelta != null && elecDelta < 0) {
    issues.push('The electricity meter reads lower at the end than at the start.');
  }
  if (hourDelta != null && hourDelta < 0) {
    issues.push('The hour meter reads lower at the end than at the start.');
  }
  if (isPress && pieces != null && pieces <= 0) {
    issues.push('A run that made no pieces has nothing to cost.');
  }
  if (isCracker && (pickLabourers ?? 0) > 0 !== (pickHours ?? 0) > 0) {
    issues.push('Picking needs both the labourers and the hours, or neither.');
  }

  return {
    isAuto: run.kind === 'autoclave',
    isPress,
    isCracker,
    pickingLabourHours,
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
    energy: elecDelta != null ? round2(elecDelta) : asNumber(draft.kwh),
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
      case 'mix':
        // The batch it is filed under leads the list the server stores, so it
        // is sent with the tailings rather than left to be inferred - and an
        // emptied mix sends the empty list, which is what clears the columns.
        payload.sources = mixList(draft).length
          ? [draft.batchNo.trim(), ...mixList(draft)]
          : [];
        break;
      default:
        payload[field] = asNumber(draft[field]);
    }
  }
  if (math.elecPair) delete payload.kwh;
  if (math.hourPair) delete payload.hoursRun;
  return payload;
}

/**
 * What a delete actually took, as a sentence for the crew.
 *
 * A run is not only its own row. What it packed was standing in the yard and
 * what the bench tested was on the lab's table, and deleting the run takes both
 * - so "Entry deleted" on its own understates it by exactly the part somebody
 * would want to check. The count and the group are named, because a supervisor
 * who sees the yard drop by twelve sacks an hour later should be able to
 * remember why.
 *
 * The batch card is the third place a run leaves a mark - the discharge on its
 * autoclave load, the tick on the grade a refiner settled - and the delete takes
 * those back too. That one is worth naming for a different reason than the yard:
 * nobody would ever connect a grade that has quietly unticked itself to a run
 * somebody deleted last week.
 *
 * The unaccounted case is the one worth saying out loud: packed output no group
 * could be found for is a discrepancy in the yard that no screen would
 * otherwise show, so the server's note is passed straight through.
 */
export function deletedSummary(removed: RemovedRun): { message: string; warn: boolean } {
  const parts: string[] = ['Entry deleted'];
  if (removed.stock_cleared) {
    const { taken, label, removed: gone } = removed.stock_cleared;
    parts.push(gone ? `${label} cleared from stock` : `${taken} off ${label}`);
  }
  if (removed.quality_tests_deleted) {
    const n = removed.quality_tests_deleted;
    parts.push(`${n} lab test${n > 1 ? 's' : ''} removed`);
  }
  if (removed.batch_cleared) {
    const { ref, discharge_cleared, qualities_cleared } = removed.batch_cleared;
    if (qualities_cleared.length) parts.push(`${qualities_cleared.join(', ')} unmarked on ${ref}`);
    if (discharge_cleared) parts.push(`${ref} back in the autoclave`);
  }
  if (removed.stock_note) return { message: removed.stock_note, warn: true };
  return { message: parts.join(' · '), warn: false };
}
