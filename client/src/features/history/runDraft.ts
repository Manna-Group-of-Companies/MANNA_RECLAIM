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

/**
 * An instant as a `datetime-local` box holds it - 'YYYY-MM-DDTHH:MM', in plant
 * local time, blank for one that was never recorded.
 *
 * Built off the parts rather than off toISOString(), which hands back UTC and
 * would put a 02:00 charge on the previous evening. The box carries its date as
 * well as its clock because a charge put in at 22:00 comes out the next day, and
 * a time on its own would quietly file the discharge before the load.
 */
export const localStamp = (iso?: string | null) => {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`;
};

/** The instant behind such a box. Null while it is empty or half-typed. */
export const instantOf = (local: string) => {
  const typed = local.trim();
  if (!typed) return null;
  const at = new Date(typed);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/** Whole minutes between two instants, either of which may be missing. */
const gap = (from: string | null, to: string | null) =>
  from == null || to == null
    ? null
    : Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);

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
  /*
   * The two ends of the run, for the machine that is timed by them.
   *
   * Correctable for the reason the mix above is: there was one moment it could
   * be said and that moment has passed. Neither end of an autoclave charge is
   * stamped the way a refiner's is - the load sheet takes a loading time, and a
   * charge pulled at 02:00 is discharged on the record when the crew get back
   * to the office - so both are typed, and the sheet that asks is gone the
   * moment the vessel is empty.
   */
  startedAt: localStamp(run.started_at),
  endedAt: localStamp(run.ended_at),
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
  /** The clock between the two ends of the run, in minutes. */
  clockMin: number | null;
  /**
   * Whether an end has been moved, and whether the run time is about to follow
   * it. A vessel has no hour meter, so the clock is what timed the charge -
   * unless the crew type a figure themselves, which is the way in for the old
   * rows whose two ends were both stamped when the tablet flushed them and so
   * say nothing about what the vessel did.
   */
  clockMoved: boolean;
  clockTimesRun: boolean;
  /**
   * A cycle time left standing outside the charge by a correction to its ends.
   *
   * Said rather than refused. The 21 bar and door times are recorded at the
   * discharge and are not on this form, so refusing would leave a charge that
   * cannot be corrected at all - and a heat-up measured against a window that
   * no longer contains it is worth a word to whoever is standing there.
   */
  cycleAdrift: boolean;
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

  // The two ends of the run, read off the draft so the sheet can show what a
  // corrected time works out to before it is saved - exactly as a meter pair is
  // shown - and compared against the run to say whether the run time follows.
  const startedAt = instantOf(draft.startedAt);
  const endedAt = instantOf(draft.endedAt);
  const clockMin = gap(startedAt, endedAt);
  const clockMoved =
    draft.startedAt !== localStamp(run.started_at) || draft.endedAt !== localStamp(run.ended_at);
  // A time recorded inside the charge that the corrected ends no longer contain.
  const outside = (iso?: string | null) => {
    const at = instantOf(localStamp(iso));
    if (at == null) return false;
    const fromStart = gap(startedAt, at);
    const toEnd = gap(at, endedAt);
    return (fromStart != null && fromStart < 0) || (toEnd != null && toEnd < 0);
  };

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
  if (clockMin != null && clockMin < 0) {
    issues.push('That has the run ending before it started.');
  }
  /*
   * A run in progress is on the record like any other and History lists it, so
   * its edit form opens with an empty end. Filling that in is not what stopping
   * a machine does: the stop sheet weighs the firewood, releases the batch and
   * marks the card, and a date typed here would do none of it and leave a
   * charge that reads as finished and is still in the vessel.
   */
  if (run.status === 'running' && endedAt) {
    issues.push('That run is still in progress - stop it on the Machines tab.');
  }

  /*
   * Whether the run time is about to follow the clock, on the same order of
   * preference the server applies: a figure entered by hand wins, then the hour
   * meter, then the clock between the two ends.
   *
   * The hand-entered case is not a formality. The tablets stamped both ends of
   * some old rows at the moment they flushed them, so the clock on those is a
   * few seconds regardless of what the machine did, and the typed figure is the
   * only record there is of what it ran.
   */
  const clockTimesRun =
    clockMoved &&
    clockMin != null &&
    clockMin >= 0 &&
    hourDelta == null &&
    draft.hoursRun === text(run.hours_run);

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
    // What the run will read once saved - so a corrected discharge shows the run
    // time it is about to write, not the one it is replacing.
    runHours:
      hourDelta ?? (clockTimesRun ? round2((clockMin as number) / 60) : asNumber(draft.hoursRun)),
    output: asNumber(draft.outWeight),
    clockMin,
    clockMoved,
    clockTimesRun,
    cycleAdrift: clockMoved && (outside(run.pressure_at) || outside(run.door_open_at)),
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
      /*
       * The two ends of the run. An emptied box sends nothing: a run started
       * and one that is on record as finished ended, so a blank there is a box
       * being cleared to retype rather than an answer to be saved.
       */
      case 'startedAt':
      case 'endedAt': {
        const at = instantOf(draft[field]);
        if (at) payload[field] = at;
        break;
      }
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
