const nf = (digits: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: digits });

export const kg = (value?: number | null, digits = 0) =>
  value == null ? '--' : `${nf(digits).format(value)} kg`;

export const rupees = (value?: number | null) =>
  value == null ? '--' : `Rs ${nf(2).format(value)}`;

export const num = (value?: number | null, digits = 1) =>
  value == null ? '--' : nf(digits).format(value);

/**
 * A finished run's duration, from the minutes the crew recorded.
 *
 * Do NOT compute this from started_at/ended_at: the tablets stamp both when
 * they flush the row to the server, so the gap between them is a few seconds
 * regardless of how long the machine actually ran.
 */
export const duration = (runtimeMin?: number | null, hoursRun?: number | null) => {
  const mins = runtimeMin ?? (hoursRun != null ? hoursRun * 60 : null);
  if (mins == null) return '--';
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

/** Milliseconds as H:MM:SS, the way the prototype's timer reads. */
const hms = (ms: number) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** Live timer for a run in progress, matching the prototype's H:MM:SS. */
export const elapsed = (fromISO: string, toISO?: string | null) =>
  hms((toISO ? new Date(toISO) : new Date()).getTime() - new Date(fromISO).getTime());

/** A run as far as its pauses go - what runElapsed() and pausedMs() need of it. */
export interface Pausable {
  paused?: boolean | null;
  paused_at?: string | null;
  paused_ms?: number | null;
}

/**
 * Every pause a run has taken, in milliseconds: the ones already ended, which
 * the server banks into `paused_ms` on each resume, plus the one it is standing
 * in now, measured off `paused_at`.
 */
export const pausedMs = (run?: Pausable | null, at: number = Date.now()) => {
  const banked = Math.max(0, Number(run?.paused_ms) || 0);
  if (!run?.paused || !run.paused_at) return banked;
  const from = new Date(run.paused_at).getTime();
  return Number.isNaN(from) ? banked : banked + Math.max(0, at - from);
};

/**
 * How long a run has actually run, H:MM:SS - the clock since it started, less
 * every pause it has taken.
 *
 * A paused machine is not running, so its timer stands still: the figure holds
 * where it was when Pause was tapped and carries on from there on Resume,
 * instead of counting the break in and reading high for the rest of the shift.
 * The same subtraction the server makes when it books the minutes at a stop, so
 * the card and the record agree.
 */
export const runElapsed = (run: Pausable & { started_at: string }, at: number = Date.now()) =>
  hms(at - new Date(run.started_at).getTime() - pausedMs(run, at));

/**
 * Hours a run took, in the back office's order of preference: what the crew
 * recorded, then the hour meter either side of it, then the runtime. Never the
 * two timestamps - those are written seconds apart when a tablet syncs.
 */
export const hours = (run: {
  hours_run?: number | null;
  hour_start?: number | null;
  hour_end?: number | null;
  runtime_min?: number | null;
}) => {
  if (run.hours_run != null) return Number(run.hours_run);
  if (run.hour_end != null && run.hour_start != null) {
    return Math.max(0, Number(run.hour_end) - Number(run.hour_start));
  }
  if (run.runtime_min != null) return Number(run.runtime_min) / 60;
  return null;
};

/** kWh for a run, from the total or from the meter readings around it. */
export const kwhOf = (run: {
  kwh?: number | null;
  elec_start?: number | null;
  elec_end?: number | null;
}) => {
  if (run.kwh != null) return Number(run.kwh);
  if (run.elec_end != null && run.elec_start != null) {
    return Math.max(0, Number(run.elec_end) - Number(run.elec_start));
  }
  return null;
};

/** "3m ago" / "2h 10m ago" - how the bearing sheet dates the last reading. */
export const ago = (at?: number | string | null) => {
  if (at == null) return '--';
  const ms = typeof at === 'number' ? at : new Date(at).getTime();
  if (Number.isNaN(ms)) return '--';
  const secs = Math.round((Date.now() - ms) / 1000);
  if (secs < 60) return `${Math.max(0, secs)}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${h}h${rem ? ` ${rem}m` : ''} ago`;
};

/** Minutes as "2h 10m" - used for a bearing interval or a downtime span. */
export const minutes = (mins?: number | null) => {
  if (mins == null) return '--';
  const total = Math.abs(Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
