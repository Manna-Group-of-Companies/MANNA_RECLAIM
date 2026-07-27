/**
 * Every object exposed by PostgREST on the reclaim project, in dependency-free
 * alphabetical order. `kind` mirrors Supabase: `table` holds the rows, `view` is
 * derived and gets rebuilt from the tables on every run - copying it is a
 * snapshot for reporting, not a source of truth.
 */
export const SUPABASE_OBJECTS = [
  { name: 'batch_costing_special', kind: 'view', group: 'costing' },
  { name: 'bearing_logs', kind: 'table', group: 'maintenance' },
  { name: 'bearing_temp_log', kind: 'view', group: 'maintenance' },
  { name: 'checklist_latest', kind: 'view', group: 'maintenance' },
  { name: 'checklist_logs', kind: 'table', group: 'maintenance' },
  { name: 'coarse_shift_costing', kind: 'view', group: 'costing' },
  { name: 'coarse_shift_detail', kind: 'view', group: 'costing' },
  { name: 'conversions', kind: 'table', group: 'production' },
  { name: 'cost_rates', kind: 'table', group: 'costing' },
  { name: 'customer_effective_rate', kind: 'view', group: 'dispatch' },
  { name: 'customer_rates', kind: 'table', group: 'dispatch' },
  { name: 'customers', kind: 'table', group: 'dispatch' },
  { name: 'dispatch_load_items', kind: 'table', group: 'dispatch' },
  { name: 'dispatch_loads', kind: 'table', group: 'dispatch' },
  { name: 'dispatch_revenue_by_grade', kind: 'view', group: 'dispatch' },
  { name: 'dispatch_value', kind: 'view', group: 'dispatch' },
  { name: 'dispatches', kind: 'table', group: 'dispatch' },
  { name: 'efficiency_notes', kind: 'table', group: 'production' },
  { name: 'formulation_rm', kind: 'view', group: 'production' },
  { name: 'formulations', kind: 'table', group: 'production' },
  { name: 'live_state', kind: 'table', group: 'state' },
  { name: 'machine_shift_efficiency', kind: 'view', group: 'production' },
  { name: 'machine_targets', kind: 'table', group: 'production' },
  { name: 'maintenance', kind: 'table', group: 'maintenance' },
  { name: 'material_rates', kind: 'table', group: 'costing' },
  { name: 'monthly_quality_costing', kind: 'view', group: 'costing' },
  { name: 'overheads', kind: 'table', group: 'costing' },
  { name: 'price_list', kind: 'table', group: 'dispatch' },
  { name: 'quality_latest', kind: 'view', group: 'quality' },
  { name: 'quality_tests', kind: 'table', group: 'quality' },
  { name: 'rates', kind: 'table', group: 'costing' },
  { name: 'runs', kind: 'table', group: 'production' },
  { name: 'sessions', kind: 'table', group: 'state' },
  { name: 'shared_state', kind: 'table', group: 'state' },
  { name: 'shift_activity', kind: 'view', group: 'production' },
  { name: 'shift_costing', kind: 'view', group: 'costing' },
  { name: 'shifts', kind: 'table', group: 'production' },
  { name: 'special_batch_detail', kind: 'view', group: 'quality' },
  { name: 'special_batch_quality', kind: 'view', group: 'quality' },
];

export const TABLES = SUPABASE_OBJECTS.filter((o) => o.kind === 'table');
export const VIEWS = SUPABASE_OBJECTS.filter((o) => o.kind === 'view');

export default SUPABASE_OBJECTS;
