import { op } from './base.service.js';
import { runService } from './run.service.js';
import { COARSE_GRADE, isMoulding } from '../config/constants.js';

/**
 * The machine log, as a file the back office can take away.
 *
 * One row per logged run and one column set for the whole plant, which is the
 * only arrangement that answers the question this is asked for. A cracker, an
 * autoclave, a refiner, a press and a sleeve bench record different things - the
 * autoclave has firewood and no meters, the press has pieces and no hours - and
 * a per-machine column set would give the office five files that cannot be put
 * beside each other. So every column is here and a machine that does not record
 * one leaves it empty, which is what a blank cell means: not measured, rather
 * than zero.
 *
 * `batchNo` is the column worth naming. On the special line it is the autoclave
 * charge, on a coarse load it is the coarse number, and on a sleeve or loop run
 * it is the generated shift number, `03/Aug/26-day` - three different series in
 * one column, and correctly so: in each case it is what that output is filed in
 * the yard under, which is what somebody reading this file back against a stock
 * report needs it to be.
 *
 * On a sleeve or loop row it is half of that, and the `Product` column is the
 * other half. The number used to read `SLEEVE-03/Aug/26-day` and carry both, so
 * anything wanting to know what a row made could take the string apart and get
 * it - which is exactly what nothing should do now. Two rows of the same shift
 * share the number and differ only in `Product`, so a pivot on the batch number
 * alone sums sleeve and loop together. Group by both.
 */

/**
 * The columns, in the order a supervisor reads a shift: when and where first,
 * then what it was making, then what it took and what came off it.
 *
 * The header is the plain-English name because this file is opened in a
 * spreadsheet by people who have never seen the schema, and `pickcut_workers` is
 * not a thing anybody has to decode.
 */
const COLUMNS = [
  ['Shift date', (run) => run.shift_date],
  ['Shift', (run) => run.shift],
  ['Machine', (run) => run.machine ?? run.machine_id],
  ['Machine ID', (run) => run.machine_id],
  ['Kind', (run) => run.kind],
  ['Line', (run) => run.line],
  ['Batch no', (run) => run.batch_no],
  ['Formulation', (run) => run.formulation],
  ['Quality', (run) => run.quality ?? (run.line === 'coarse' ? COARSE_GRADE : null)],
  ['Product', (run) => run.product],
  ['Tyre', (run) => run.tyre_type],
  ['Mesh', (run) => run.mesh],
  ['Started', (run) => run.started_at],
  ['Stopped', (run) => run.ended_at],
  ['Runtime (min)', (run) => run.runtime_min],
  ['Hours run', (run) => run.hours_run],
  ['Start/stops', (run) => run.passes],
  ['Cavities', (run) => run.cavities],
  ['Cycle (min)', (run) => run.cyclic_min],
  ['Cure (C)', (run) => run.cure_temp_c],
  ['Pieces', (run) => run.pieces],
  ['Pieces expected', (run) => run.pieces_expected],
  ['Pieces variance %', (run) => run.pieces_variance_pct],
  // A word rather than TRUE/FALSE: a spreadsheet filter on "over" reads as a
  // question somebody asked, and an empty cell means there was nothing to
  // compare against rather than that the run was fine.
  ['Variance flag', (run) => (run.pieces_expected == null ? null : run.pieces_flagged ? 'over' : 'ok')],
  ['Output (kg)', (run) => run.weight_kg],
  ['Flash (kg)', (run) => run.flash_kg],
  ['Packed sacks', (run) => run.packed_sacks],
  ['Packed pieces', (run) => run.packed_pieces],
  ['Workers', (run) => run.workers],
  ['Labour hours', (run) => run.labour_hours],
  ['Labour cost', (run) => run.labour_cost],
  ['Material cost', (run) => run.material_cost],
  ['Cost per piece', (run) => run.cost_per_piece],
  ['Picking labourers', (run) => run.picking_labourers],
  ['Picking hours', (run) => run.picking_hours],
  ['Electricity start', (run) => run.elec_start],
  ['Electricity end', (run) => run.elec_end],
  ['kWh', (run) => run.kwh],
  ['Hour meter start', (run) => run.hour_start],
  ['Hour meter end', (run) => run.hour_end],
  ['Firewood (kg)', (run) => run.firewood_kg],
  ['Supervisor', (run) => run.supervisor],
  ['Remarks', (run) => run.remarks],
];

/**
 * One value, quoted the way a spreadsheet will read it back.
 *
 * Everything that is not a plain number is quoted, and quotes inside are
 * doubled. That is not belt-and-braces: a remarks field with a comma in it
 * silently shifts every column after it, and a batch number is `03/Aug/26-day` -
 * a string with slashes that Excel will otherwise offer to read as a date. Null
 * and undefined are an empty cell rather than the word "null",
 * because a blank is what "this machine does not record that" looks like.
 */
function cell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export const machineLogService = {
  columns: () => COLUMNS.map(([header]) => header),

  /**
   * The log for whatever the back office has filtered to, as CSV text.
   *
   * Finished runs only. A run still in progress has no stop time, no output and
   * no cost, so exporting it would put a row of blanks into a file somebody is
   * about to total a column of - and it will be there in full the moment it is
   * logged off the machine.
   *
   * Read through runService.list() rather than off the table, so the rows carry
   * everything the API derives: the material cost of a press run, the labour and
   * the piece variance on a sleeve or loop lot, the picking hours on a cracker.
   * None of those are columns, and a second implementation that recomputed them
   * here is exactly how an exported figure comes to disagree with the screen it
   * was read off.
   */
  async csv({ from, to, machineId, shift, kind, quality, category } = {}) {
    /*
     * Every narrowing the screen offers, pushed down to the database.
     *
     * The window included, which it did not used to be: a `from` and a `to` on
     * one column are two clauses, and applyFilters now sends both rather than
     * the caller reading the whole record back and dropping most of it. The
     * rows still have to be walked for `ended_at`, so a run in progress is
     * dropped here.
     *
     * It matters that this list matches the History tab's filters exactly. The
     * button is offered as "everything matching what is on screen", and an
     * export that quietly covered more than the panel says it is showing is the
     * worst kind of wrong: it looks like it worked.
     */
    const window = [];
    if (from) window.push(op.gte(from));
    if (to) window.push(op.lte(to));

    const { rows } = await runService.list(
      { all: true, sort: 'shift_date', order: 'desc' },
      {
        ...(machineId
          ? { machine_id: machineId }
          : { machine_id: await runService.machineIdsIn(category) }),
        ...(shift ? { shift } : {}),
        ...(kind ? { kind } : {}),
        ...(quality ? { quality } : {}),
        ...(window.length ? { shift_date: window } : {}),
      },
    );
    const logged = rows.filter((run) => {
      if (!run.ended_at) return false;
      // A run with no shift date is outside any window that was asked for, and
      // inside the export when none was.
      return Boolean(run.shift_date) || (!from && !to);
    });

    const lines = [COLUMNS.map(([header]) => cell(header)).join(',')];
    for (const run of logged) {
      lines.push(COLUMNS.map(([, read]) => cell(read(run))).join(','));
    }
    // A trailing newline: a file without one is a file some tools drop the last
    // row of.
    return `${lines.join('\r\n')}\r\n`;
  },

  /**
   * What to call the file. The window it covers where the caller named one, so
   * three exports in a morning do not all land in Downloads as the same name and
   * overwrite each other.
   */
  filename({ from, to, machineId } = {}) {
    const parts = ['machine-log'];
    if (machineId) parts.push(String(machineId).toLowerCase());
    if (from) parts.push(from);
    if (to && to !== from) parts.push(to);
    return `${parts.join('_')}.csv`;
  },

  /** Whether a run is one of the two activities that carry a generated number. */
  isGeneratedBatch: (run) => isMoulding(run?.kind),
};

export default machineLogService;
