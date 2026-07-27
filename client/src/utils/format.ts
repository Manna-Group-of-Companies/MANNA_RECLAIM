const nf = (digits: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: digits });

export const kg = (value?: number | null, digits = 0) =>
  value == null ? '--' : `${nf(digits).format(value)} kg`;

export const rupees = (value?: number | null) =>
  value == null ? '--' : `Rs ${nf(2).format(value)}`;

export const num = (value?: number | null, digits = 1) =>
  value == null ? '--' : nf(digits).format(value);

/** Elapsed run time as H:MM:SS, matching the prototype timer. */
export const elapsed = (fromISO: string, toISO?: string | null) => {
  const ms = Math.max(0, (toISO ? new Date(toISO) : new Date()).getTime() - new Date(fromISO).getTime());
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
