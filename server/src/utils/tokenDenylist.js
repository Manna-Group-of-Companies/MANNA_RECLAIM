/**
 * Refresh tokens that must no longer be honoured.
 *
 * A JWT is valid until it expires, which for the refresh token is 30 days - so
 * without this, "Sign out" only cleared the cookie, and anyone who had copied
 * that cookie off a tablet kept a working session for a month. Every refresh
 * token carries a `jti`; revoking one records that id until the moment the
 * token would have expired anyway, after which the entry is dead weight and is
 * dropped.
 *
 * Held in this process, not in the database. That is the right size for a plant
 * running one API server, and it is honest about its limits: a restart forgets
 * the list, and a second instance would not share it. If the API is ever run
 * more than once over, this wants to become a `sessions` row - the interface
 * here is what would stay.
 */

/** jti -> { activeAt, expiresAt } in epoch ms. */
const revoked = new Map();

const REFRESH_MAX_MS = 30 * 24 * 60 * 60 * 1000;

/** Cheap enough to sweep inline; the map only holds live sign-outs. */
const sweep = (now) => {
  for (const [jti, entry] of revoked) {
    if (entry.expiresAt <= now) revoked.delete(jti);
  }
};

/**
 * Stop honouring a refresh token.
 *
 * `graceMs` is what makes rotation safe to deploy against real tablets. When a
 * token is spent on a refresh it is not dead the same instant: two tabs share
 * one cookie and can both ask at once, and a refresh whose reply was lost to a
 * dropped connection is retried with the same token. Either would otherwise
 * come back 401 and sign the crew out mid-shift. Inside the window a replay is
 * allowed and simply gets a fresh pair; past it, the token is refused - which
 * is the case that actually matters, a cookie copied off a device and used
 * later. Signing out passes no grace, because there the intent is unambiguous.
 *
 * @param {string} jti
 * @param {number} [expSeconds] the token's `exp` claim, in seconds.
 * @param {number} [graceMs] how long a replay is still tolerated.
 */
export function revoke(jti, expSeconds, graceMs = 0) {
  if (!jti) return;
  const now = Date.now();
  sweep(now);
  const expiresAt = expSeconds ? expSeconds * 1000 : now + REFRESH_MAX_MS;
  if (expiresAt <= now) return; // already expired on its own
  const activeAt = now + Math.max(0, graceMs);
  // Never let a later, more forgiving call loosen an existing entry: a sign-out
  // must not be softened by a rotation that raced it.
  const existing = revoked.get(jti);
  if (existing && existing.activeAt <= activeAt) return;
  revoked.set(jti, { activeAt, expiresAt });
}

export function isRevoked(jti) {
  if (!jti) return false;
  const entry = revoked.get(jti);
  if (!entry) return false;
  const now = Date.now();
  if (entry.expiresAt <= now) {
    revoked.delete(jti);
    return false;
  }
  // Still inside its grace window - spent, but not yet refused.
  return entry.activeAt <= now;
}

/** Test/diagnostic helper - how many sign-outs are still being remembered. */
export const revokedCount = () => {
  sweep(Date.now());
  return revoked.size;
};

export default { revoke, isRevoked, revokedCount };
