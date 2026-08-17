import { TABLES, VIEWS } from './constants.js';

/**
 * What each Supabase table looks like, from the server's point of view.
 *
 * Types, defaults, constraints and uniqueness all live in the database itself
 * (supabase/schema.sql), so there is no schema to restate here. All the server
 * needs to know about a table is:
 *
 *   key      the primary-key column, for findById / update / delete.
 *            `null` means the table is keyed on a pair of columns and can only
 *            be reached through list() and an explicit upsert conflict target.
 *   columns  the columns the server may write. A payload is filtered down to
 *            these before it is sent, so a stray field from a tablet cannot
 *            fail the whole insert - and boot-time verification uses the same
 *            list to report what the project is still missing.
 *
 * Views are read-only and derived, so they declare no columns.
 */

const table = (key, columns) => ({ key, columns, readOnly: false });
const view = () => ({ key: null, columns: [], readOnly: true });

/** Columns every shop-floor row carries: who wrote it and when. */
const AUDIT = ['device', 'created_at'];

export const registry = {
  // ---- accounts and the machine list (created by supabase/schema.sql) ----
  [TABLES.users]: table('id', [
    'id', 'name', 'role', 'active', 'pin_hash',
    'last_login_at', 'last_seen_at', 'last_logout_at', 'created_at', 'updated_at',
  ]),

  [TABLES.machines]: table('id', [
    'id', 'name', 'short', 'kind', 'group_name', 'sub', 'accent', 'capacity',
    'out_weight', 'needs_quality', 'weigh', 'tyre', 'def_tyre', 'enabled', 'sort_order',
    'created_at', 'updated_at',
    // The finer name the back office lists it under, and - on a press - the
    // platen it moulds on. Null on everything that is not one.
    'type', 'platen_length_mm', 'platen_width_mm', 'platen_count', 'capacity_kg',
  ]),

  // What the presses mould. The curing settings live on the product because the
  // same press moulds a different one tomorrow - see supabase/schema.sql.
  [TABLES.products]: table('id', [
    'id', 'name', 'cure_temp_c', 'cyclic_min', 'cavities', 'compound_rate',
    'note', 'active', 'sort_order', 'created_at', 'updated_at',
    // The other half of a product record: what it is ordered as, what it ships
    // in, which machine it comes off, and the cost inputs behind a unit of it.
    'code', 'quality', 'pack_size_kg', 'machine_id',
    'raw_material_cost', 'firewood_cost', 'power_kwh', 'labour_cost', 'machine_hours',
    // What a moulded product ships in - pieces to a pack, what that pack is
    // called, and what one piece weighs. `pack_size_kg` above is the other
    // thing: what a sack of a reclaim grade weighs. See migrations/0005.
    'pack_size', 'pack_label', 'piece_kg',
    // Whether the item is moulded at all. Cavities and a cycle time are facts
    // about a mould, so a sleeve that is cut rather than moulded is asked for
    // neither - see migrations/0006.
    'moulded',
  ]),

  // ---- production ----
  [TABLES.runs]: table('id', [
    'id', ...AUDIT, 'updated_at',
    'line', 'machine_id', 'machine', 'kind', 'batch_no', 'shift_date', 'shift',
    'capacity', 'formulation', 'autoclave_id', 'paired', 'quality', 'tyre_type',
    'mesh', 'passes', 'started_at', 'ended_at', 'runtime_min', 'hours_run',
    'kwh', 'firewood_kg', 'workers', 'weight_kg', 'supervisor', 'supervisor_shift',
    // The account the start was authenticated as. `supervisor` above is the name
    // the record is signed with and the crew may switch it; this one they cannot
    // - see migrations/0013.
    'entered_by',
    'src1', 'src2', 'src3', 'src4',
    'elec_start', 'elec_end', 'hour_start', 'hour_end',
    'conv_out_kg', 'conv_in_kg', 'leftout_in', 'leftout_out', 'packed_sacks',
    'loaded_at', 'unloaded_at', 'pickcut_workers', 'pickcut_hours',
    // Why the picking gang was the size it was - see migrations/0004.
    'pickcut_remarks',
    // Added by supabase/schema.sql - the tablets never had these.
    'remarks', 'needs_weigh', 'paused', 'paused_at', 'non_production', 'weigh_entries',
    // A moulding press run: the product, the curing settings copied off it as
    // the run started, and what came out of the mould.
    'product', 'cavities', 'cyclic_min', 'cure_temp_c', 'pieces', 'flash_kg', 'compound_rate',
    // How many of those pieces have been boxed and filed as stock. The mirror of
    // `packed_sacks` on a bagged run, and what makes re-packing a press run send
    // the *change* to the yard rather than the whole count again.
    'packed_pieces',
    // A sleeve or loop run. `pieces_expected` is what the cycle and the mould
    // said the run should have made, kept beside the count off the bench so the
    // two can be compared afterwards rather than only while somebody is standing
    // there; `labour_rate` is the rate in force on the day it was worked, so a
    // rate raised next month prices the next shift and not this one.
    'pieces_expected', 'labour_rate',
  ]),

  [TABLES.shifts]: table('id', ['id', 'shift_date', 'shift', 'supervisor', 'updated_at']),

  [TABLES.conversions]: table('id', [
    'id', ...AUDIT, 'batch_no', 'from_quality', 'to_quality', 'qty_kg', 'stage',
    'ts', 'shift_date', 'shift', 'supervisor',
  ]),

  [TABLES.efficiencyNotes]: table('id', [
    'id', 'shift_date', 'shift', 'line', 'metric', 'quality', 'value',
    'baseline', 'reason', 'entered_by', 'created_at',
  ]),

  /**
   * Why an actual missed the manager's ideal. `ideal` and `actual` are snapshots
   * taken as the reason was written rather than looked up afterwards: a target
   * raised next month must not rewrite what last month's shortfall was measured
   * against. See migrations/0014.
   */
  [TABLES.varianceReasons]: table('id', [
    'id', 'shift_date', 'shift', 'parameter', 'label', 'ideal', 'actual',
    'reason', 'entered_by', 'created_at',
  ]),

  // ---- quality ----
  [TABLES.qualityTests]: table('id', [
    'id', ...AUDIT, 'ts', 'kind', 'batch_no', 'shift_date', 'shift', 'verdict',
    'params', 'tester', 'notes', 'quality', 'attachment_url', 'attachment_name',
    // Added by supabase/schema.sql.
    'run_id', 'machine_id',
  ]),

  // ---- maintenance ----
  [TABLES.maintenance]: table('id', [
    'id', ...AUDIT, 'machine_id', 'machine', 'down_start', 'repaired_at',
    'downtime_min', 'root_cause', 'resolution', 'prevention',
    // Added by supabase/schema.sql.
    'logged_by', 'resolved_by',
  ]),

  [TABLES.bearingLogs]: table('id', [
    'id', ...AUDIT, 'machine_id', 'machine', 'position', 'bearing_type',
    'temp_c', 'ts', 'shift_date', 'shift', 'supervisor', 'recorded_at', 'logged_at',
    // Added by supabase/schema.sql.
    'notes',
  ]),

  // ---- dispatch ----
  // The shop floor calls these customer/grade/total_kg/dispatch_date; the
  // columns below are what Supabase actually named them, and
  // dispatch.service.js translates between the two.
  [TABLES.dispatches]: table('id', [
    'id', ...AUDIT, 'customer_name', 'quality', 'dispatched_at', 'weight_kg',
    'sacks', 'driver',
    // The priced document the back office posts: who it went to, on what day,
    // whether we carried it and what that was charged at. Written only by
    // post_dispatch(), never by a PATCH - a dispatch is corrected by a reversal
    // and a fresh one, so the ledger keeps what happened.
    'customer_id', 'dispatch_date', 'transport_provided', 'transport_charge', 'created_by',
    // Added by supabase/schema.sql - which vehicle left with the load, and
    // whether it was one of ours or the customer's.
    'vehicle_no', 'own_vehicle',
    // Which packed run the sacks came off, and the batch they were made on.
    // `run_id` is what ties a load back to the stock it drew down, so the
    // packed sacks still in the yard can be worked out.
    'run_id', 'batch_no', 'remarks',
  ]),

  [TABLES.dispatchLoads]: table('id', [
    'id', ...AUDIT, 'ts', 'customer', 'vehicle_no', 'driver', 'supervisor',
    // Added by supabase/schema.sql - weighbridge loads were never stored.
    'dispatch_id', 'gross_kg', 'tare_kg', 'net_kg', 'bags',
  ]),

  /**
   * What packing files sacks into. `available_sacks` is generated by Postgres
   * and both counts are moved by the two functions in
   * supabase/migrations/0001_stock_and_dispatch.sql, so none of the three is
   * writable from here - listing them would let a PATCH set a stock level by
   * hand and walk straight past the oversell check.
   */
  /**
   * The three count columns are absent on purpose: `packed_sacks`,
   * `dispatched_sacks` and `available_sacks` are moved by Postgres - by
   * record_packed_stock() on the way in and post_dispatch() on the way out -
   * and listing them here would make them writable through the generic CRUD,
   * which is the one path that would step around the oversell check.
   *
   * `unit`, `product_id`, `pack_size` and `kg_per_unit` are the same story: the
   * function that files the stock sets them. What is writable from the server
   * is the QC verdict and its signature, which is what PATCH /stock/:id/qc is.
   */
  [TABLES.stockGroups]: table('id', [
    'id', 'kind', 'label', 'quality', 'qc_status', 'period_start', 'period_end', 'created_at',
    // Added by migrations/0005 - what the counts count, what the group is, what
    // one of them weighs, and the span it was packed across.
    'unit', 'product_id', 'pack_size', 'kg_per_unit', 'first_packed_on', 'last_packed_on',
    // Who released it and when. Written by the lab pushing a verdict across and
    // by the back office overriding one; `qc_source` tells the two apart.
    'qc_by', 'qc_at', 'qc_source',
  ]),

  // Written only by post_dispatch(), inside the same transaction as the header.
  // `sacks` is the quantity in the group's unit, and `unit` is what says which -
  // see the note on dispatch_lines in schema.sql.
  [TABLES.dispatchLines]: table('id', [
    'id', 'dispatch_id', 'stock_group_id', 'quality', 'sacks', 'unit', 'unit_price',
    'line_total', 'created_at',
  ]),

  /**
   * What it cost to load one truck.
   *
   * The two rate columns are snapshots taken when the entry was written, not
   * lookups - a settings change must not silently reprice last month. The three
   * cost columns are generated by Postgres from the snapshot and the quantities
   * beside them, so a stored total cannot drift from the figures it is the sum
   * of, and none of the three is listed here: they are not writable.
   */
  [TABLES.loadingActivities]: table('id', [
    'id', 'dispatch_id', 'loading_mode', 'material_kind', 'kg_loaded',
    'contract_rate_per_kg', 'manhour_labourers', 'manhour_hours', 'daily_labour_rate',
    'vehicle_no', 'remarks', 'created_by', 'created_at',
  ]),

  // ---- rate card and costing inputs ----
  /**
   * Keyed on the surrogate `id` rather than on the name: a dispatch points at a
   * customer, and a name is not something to hang a foreign key off - it gets
   * corrected. The name stays the table's primary key in Postgres, which is what
   * customer_rates and the whole rate card are still written against.
   */
  [TABLES.customers]: table('id', [
    'id', 'name', 'phone', 'address', 'region', 'active', 'created_at',
  ]),
  [TABLES.customerRates]: table(null, ['customer', 'grade', 'rate', 'note']),
  [TABLES.priceList]: table('grade', ['grade', 'rate']),
  [TABLES.rates]: table('id', [
    'id', 'electricity_rate', 'labour_rate', 'firewood_rate', 'packing_rate', 'updated_at',
  ]),
  [TABLES.costRates]: table('id', [
    'id', 'data', 'updated_at',
    // Added by supabase/schema.sql.
    'updated_by',
  ]),
  /**
   * The manager's benchmarks - one row, id 'current', every figure inside
   * `data`. Same shape as cost_rates above and for the same reason: the set of
   * figures grows as the plant measures more things, and a column per figure
   * would be a migration every time it does. See IDEAL_VALUE_KEYS.
   */
  [TABLES.idealValues]: table('id', ['id', 'data', 'updated_at', 'updated_by']),
  /**
   * One row per change to the labour rate, each with the day it came into
   * force. `per_hour` is what the costing multiplies by; a row that gave the
   * day wage instead has it worked out on the way in, so the column is never
   * null on a row this API wrote. See supabase/migrations/0004.
   */
  [TABLES.labourRates]: table('id', [
    'id', 'effective_from', 'per_hour', 'daily_wage', 'shift_hours', 'note',
    'created_at', 'created_by',
  ]),
  [TABLES.materialRates]: table('id', [
    'id', 'scrap_tyre_truck_rate', 'scrap_tyre_bike_rate', 'process_cost',
    'tyre_crumb_rate', 'bike_crumb_rate', 'buffing_powder_rate', 'rpo_rate',
    'ra_rate', 'pinetar_rate', 'china_clay_rate', 'updated_at',
  ]),
  [TABLES.formulations]: table('name', [
    'name', 'line', 'capacity', 'total_wt_kg', 'tyre_crumb_kg', 'bike_crumb_kg',
    'buffing_powder_kg', 'reclaiming_oil_kg', 'reclaiming_agent_kg',
    'pinetar_kg', 'china_clay_kg', 'note',
  ]),
  [TABLES.machineTargets]: table('machine_id', [
    'machine_id', 'machine', 'ideal_kg_per_hour', 'note',
  ]),

  // ---- whole-plant state the tablets sync ----
  // One row, id 'plant', with every batch, leftout and counter inside `doc`.
  [TABLES.sharedState]: table('id', ['id', 'doc', 'version', 'updated_by', 'updated_at']),
  [TABLES.liveState]: table('device', ['device', 'state', 'updated_at']),
  [TABLES.sessions]: table('device', [
    'device', 'account', 'role', 'sup_name', 'heartbeat', 'created_at',
  ]),

  // ---- derived views: read-only, rebuilt by Postgres from the tables above ----
  ...Object.fromEntries(Object.values(VIEWS).map((name) => [name, view()])),
};

export function specFor(name) {
  const spec = registry[name];
  if (!spec) throw new Error(`No Supabase table registered as "${name}"`);
  return spec;
}

/** The primary key column, or null for the pair-keyed tables. */
export const keyOf = (name) => specFor(name).key;

/** Drops anything the table has no column for, so one stray field cannot fail an insert. */
export function pickColumns(name, payload = {}) {
  const { columns } = specFor(name);
  if (!columns?.length) return { ...payload };
  const allowed = new Set(columns);
  return Object.fromEntries(Object.entries(payload).filter(([column]) => allowed.has(column)));
}

/** Only the writable tables are worth verifying at boot; views follow their sources. */
export const writableRegistry = Object.fromEntries(
  Object.entries(registry).filter(([, spec]) => !spec.readOnly),
);

export default registry;
