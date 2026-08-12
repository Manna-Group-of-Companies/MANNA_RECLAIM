import type { Role, User } from '@/types/models';

/**
 * Who is on the supervisor app, worked out from the three stamps the server
 * keeps on an account. One place, because two screens ask it - the manager's
 * nav bar and the Users page - and a floor where those two disagreed about who
 * is working would be worse than either of them alone.
 *
 * What this is not: a live session. The server hands out a token and keeps no
 * register of who holds one, so nothing anywhere knows who is signed in at this
 * instant. What it has is when each account signed in, when it was last heard
 * from, and when it signed out, which between them answer the question the
 * plant actually asks.
 */

/**
 * How recently an account must have been heard from to count as present.
 *
 * Comfortably wider than the server's stamping interval, so somebody working
 * steadily never blinks out between two of their own writes. It is also the
 * fallback for the phone that is simply closed rather than signed out - that
 * one has to time out, because nothing tells the server it went away.
 */
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Whose presence is being asked about: the crew, not the back office.
 *
 * The activity stamp is written by any authenticated request, and reading the
 * back office is one - so without this a manager looking at the screen put
 * their own name on it, every time, as the only name there.
 */
export const FLOOR_ROLES: Role[] = ['worker', 'supervisor'];

const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * When this account was last known to be present.
 *
 * The activity stamp alone, and deliberately not the sign-in.
 *
 * It did briefly count a sign-in as presence, to keep the screen from reading
 * empty against an API that had not been redeployed yet - and that was a
 * mistake worth recording. A server old enough to write only the sign-in is
 * also too old to write the sign-out, so a supervisor who signed in and then
 * went home could not be taken off the manager's bar by anything: the name sat
 * there for the full window with no way to retract it, and a name up there for
 * somebody who has left is the one failure this screen must not have.
 *
 * Presence is therefore read from the one stamp whose absence also means
 * something. Nothing is lost by it: a sign-in writes the activity stamp in the
 * same update - see touchLogin - so somebody who has just typed their PIN is
 * present from that moment.
 */
export const presentAt = (user: User) => time(user.last_seen_at);

/** An account is on the app while its last sighting outlives its last sign-out. */
export const isOnApp = (user: User, now = Date.now()) => {
  const at = presentAt(user);
  return at > 0 && at >= now - ACTIVE_WINDOW_MS && at > time(user.last_logout_at);
};

export interface Present {
  user: User;
  /** When they were last heard from - what the screens put a clock against. */
  at: number;
}

/** The crew on the app, most recently heard from first. */
export const onAppNow = (rows: User[], now = Date.now()): Present[] =>
  rows
    .filter((user) => FLOOR_ROLES.includes(user.role) && isOnApp(user, now))
    .map((user) => ({ user, at: presentAt(user) }))
    .sort((a, b) => b.at - a.at);

/** How long ago, for a row whose whole point is that it is recent. */
export const minsAgo = (at: number, now = Date.now()) => {
  const mins = Math.round((now - at) / 60_000);
  return mins < 1 ? 'just now' : `${mins} min ago`;
};
