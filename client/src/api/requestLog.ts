import { useSyncExternalStore } from 'react';
import { appEnv } from '@/config/env';

/**
 * What one call to the API came to.
 *
 * Deliberately thin. It records what was asked for and what came back, and
 * never what was sent: a request body on this app carries PINs at sign-in and
 * production figures everywhere else, and a diagnostic log that a supervisor
 * can copy into a chat message is exactly the wrong place for either. Headers
 * are not touched at all, which is where the bearer token lives.
 */
export interface LogEntry {
  id: number;
  at: Date;
  method: string;
  /** The route, without its query string - see `record`. */
  path: string;
  millis: number;
  /** The HTTP status, or null where the request never reached the server. */
  status: number | null;
  /**
   * The server's own message on a refusal, kept unchanged. This is the useful
   * half: "B1041-Fine has only 12 sacks left" is what somebody can act on,
   * where "409" is not.
   */
  message?: string;
  /** An aside the client adds - a token refresh, a retry. */
  note?: string;
}

export const entryOk = (e: LogEntry) => e.status != null && e.status < 400;
export const entryFailed = (e: LogEntry) => !entryOk(e);

/**
 * A network failure rather than a refusal: nothing reached the server, so there
 * is no status to read.
 */
export const entryUnreachable = (e: LogEntry) => e.status == null;

const two = (n: number) => String(n).padStart(2, '0');

const clockOf = (at: Date) => `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;

/** One line, as the screen shows it and as the clipboard receives it. */
export const entryLine = (e: LogEntry) => {
  const code = e.status?.toString() ?? 'ERR';
  return (
    `${clockOf(e.at)}  ${e.method.padEnd(6)} ${e.path.padEnd(28)} ` +
    `${code.padStart(3)}  ${e.millis}ms${e.note ? `  (${e.note})` : ''}`
  );
};

export interface RecordInit {
  method: string;
  path: string;
  millis: number;
  status?: number | null;
  message?: string;
  note?: string;
}

/**
 * Enough to cover a shift's worth of looking back without growing without bound
 * on a tablet left open all day.
 */
const CAPACITY = 200;

/**
 * The last few hundred calls this app made, kept in memory.
 *
 * The reason it exists: once these tablets are on the plant floor there is no
 * devtools console open and nobody to read one. A supervisor who says "it would
 * not save" has nothing to hand over, and the failure is usually a refusal the
 * server already explained in words - it just went past in a toast. This keeps
 * those words where they can be read afterwards and copied into a message.
 *
 * In memory only, and cleared by a reload. It is a diagnostic aid, not a
 * record: the plant's record is the API's own, and a log that persisted would
 * be one more copy of production data sitting in a shared tablet's storage.
 *
 * An external store rather than a slice of Redux, because the one thing that
 * writes to it is an axios interceptor - outside React, on every call the app
 * makes. Dispatching an action per request would put the whole log through the
 * reducer and re-render anything watching the store; here, only the two screens
 * that subscribe pay anything at all.
 */
let entries: readonly LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

export const requestLog = {
  /** Newest first, which is the order somebody reads a log in. */
  get entries() {
    return entries;
  },

  get failures() {
    return entries.filter(entryFailed).length;
  },

  record({ method, path, millis, status = null, message, note }: RecordInit) {
    const entry: LogEntry = {
      id: nextId++,
      at: new Date(),
      method: method.toUpperCase(),
      // The query string is dropped rather than trimmed. Nothing this app sends
      // puts a secret there today, and a log is the wrong place to be relying
      // on that staying true.
      path: path.split('?')[0] ?? path,
      millis: Math.round(millis),
      status,
      message,
      note,
    };
    entries = [entry, ...entries].slice(0, CAPACITY);
    emit();
  },

  clear() {
    if (entries.length === 0) return;
    entries = [];
    emit();
  },

  /**
   * The whole log as text, with enough of a header that a pasted copy says what
   * it is and what it was talking to.
   */
  asText({ account, role }: { account?: string | null; role?: string | null } = {}) {
    const head = [
      'Manna — diagnostic log',
      `API: ${appEnv.apiUrl}`,
      `Signed in: ${account || '—'}${role ? ` (${role})` : ''}`,
      `Copied: ${new Date().toISOString()}`,
      `${entries.length} calls, ${requestLog.failures} failed`,
      '',
    ];
    // Oldest first in the copy: read as a sequence, a log runs forwards.
    const body = [...entries].reverse().flatMap((e) => {
      const line = entryLine(e);
      return e.message ? [line, `        └ ${e.message}`] : [line];
    });
    return [...head, ...body].join('\n');
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

/** The log, as a component reads it. Re-renders only when a call lands. */
export function useRequestLog() {
  const rows = useSyncExternalStore(
    requestLog.subscribe,
    () => entries,
    () => entries,
  );
  return { entries: rows, length: rows.length, failures: rows.filter(entryFailed).length };
}

export default requestLog;
