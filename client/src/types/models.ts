export type Role = 'worker' | 'supervisor' | 'manager' | 'admin';
export type Shift = 'Day' | 'Night';
export type Quality = 'Special' | 'SuperFine' | 'Fine' | 'Medium' | 'DRC';
export type DispatchGrade = Quality | 'Coarse' | 'Sillsheet';
export type MachineKind = 'grind' | 'autoclave' | 'prerefiner' | 'refiner' | 'coarse';
export type RunStatus = 'running' | 'done';
export type Verdict = 'pass' | 'hold';

export interface User {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Machine {
  id: string;
  name: string;
  short: string;
  kind: MachineKind;
  group_name: string;
  accent?: string | null;
  capacity?: number | null;
  needs_quality?: boolean;
  weigh?: boolean;
  out_weight?: boolean;
  enabled: boolean;
  sort_order?: number;
  sub?: string | null;
}

export interface Batch {
  id: string;
  ref: string;
  machine_id: string;
  formulation?: string | null;
  capacity?: number | null;
  grade?: Quality | null;
  status: 'open' | 'closed';
  opened_at: string;
  opened_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  remarks?: string | null;
}

export interface Run {
  id: string;
  machine_id: string;
  batch_id?: string | null;
  quality?: Quality | null;
  shift_date: string;
  shift: Shift;
  supervisor?: string | null;
  workers?: number | null;
  started_at: string;
  stopped_at?: string | null;
  paused?: boolean;
  out_weight?: number | null;
  status: RunStatus;
  remarks?: string | null;
}

export interface QualityTest {
  id: string;
  batch_id?: string | null;
  run_id?: string | null;
  machine_id?: string | null;
  grade: Quality;
  verdict: Verdict;
  tested_by?: string | null;
  tested_at: string;
  remarks?: string | null;
}

export interface DispatchLoad {
  id: string;
  dispatch_id: string;
  vehicle?: string | null;
  driver?: string | null;
  gross_kg?: number | null;
  tare_kg?: number | null;
  net_kg?: number | null;
  bags?: number | null;
}

export interface Dispatch {
  id: string;
  customer: string;
  grade: DispatchGrade;
  dispatch_date: string;
  invoice_no?: string | null;
  vehicle?: string | null;
  driver?: string | null;
  total_kg?: number | null;
  status: 'draft' | 'dispatched' | 'invoiced';
  remarks?: string | null;
  loads?: DispatchLoad[];
  rate?: number | null;
  amount?: number | null;
}

export interface MaintenanceLog {
  id: string;
  machine_id: string;
  kind: 'breakdown' | 'service' | 'inspection' | 'other';
  title: string;
  detail?: string | null;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'closed';
  logged_at: string;
  logged_by?: string | null;
  resolved_at?: string | null;
}

export interface BearingLog {
  id: string;
  machine_id: string;
  kind: 'bearing' | 'bush';
  positions?: string[] | null;
  ts: string;
  by_user?: string | null;
  remarks?: string | null;
}

export interface BearingDue {
  machineId: string;
  intervalH: number;
  lastAt: number | null;
  dueInMin: number;
  due: boolean;
}

export interface Rate {
  customer: string;
  grade: DispatchGrade;
  rate: number;
  note?: string | null;
}

export interface ProductionReport {
  window: { from: string | null; to: string | null };
  runs: number;
  outKg: number;
  runHours: number;
  kgPerHour: number;
}

export interface EfficiencyRow {
  machineId: string;
  runs: number;
  hours: number;
  outKg: number;
  kgPerHour: number;
  kgPerWorkerHour: number;
}

export interface CostingReport {
  window: { from: string | null; to: string | null };
  autoclaveLoads: number;
  firewoodKg: number;
  revenue: number;
}
