/**
 * Restores run 98388216-097a-4d6c-898c-f04afc48cc85 - Autoclave A, batch 2641,
 * Day shift of 2026-03-19 - to the `runs` table.
 *
 *   node scripts/restore-run-2641.mjs
 *
 * Every value below is read out of the tablets' own state document
 * (`shared_state.doc.runs`), which still carries the run in full, and is laid
 * out to match its sibling rows from the same shift column for column. Running
 * it twice is refused by the primary key rather than duplicating the run.
 */
import { request } from '../src/config/supabase.js';

const iso = (ms) => new Date(ms).toISOString();

const row = {
  id: '98388216-097a-4d6c-898c-f04afc48cc85',
  device: null,
  line: 'coarse',
  machine_id: 'AC_A',
  machine: 'Autoclave A',
  kind: 'autoclave',
  batch_no: '2641',
  shift_date: '2026-03-19',
  shift: 'Day',
  capacity: 2500,
  formulation: 'Coarse 2500',
  autoclave_id: 'AC_A',
  paired: false,
  quality: null,
  tyre_type: null,
  mesh: null,
  passes: 1,
  started_at: iso(1773891000000),   // 2026-03-19T03:30:00Z
  ended_at: iso(1773922200000),     // 2026-03-19T11:20:00Z
  runtime_min: 520,
  hours_run: 8.67,
  kwh: null,
  firewood_kg: 400,
  workers: 1,
  weight_kg: null,
  elec_start: null,
  elec_end: null,
  supervisor: null,
  hour_start: null,
  hour_end: null,
  loaded_at: iso(1773891000000),
  unloaded_at: iso(1773922200000),
};

const existing = await request('runs', { select: 'id', filters: { id: row.id } });
if (existing.rows.length) {
  console.log('Already present - nothing to do.');
  process.exit(0);
}

const { rows } = await request('runs', { method: 'POST', select: '*', body: row });
console.log('Restored:\n', JSON.stringify(rows[0], null, 1));
