import { userService } from './user.service.js';
import { issueTokens, verifyRefreshToken } from '../utils/jwt.js';
import { revoke } from '../utils/tokenDenylist.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, active: u.active });

export const authService = {
  /** Name + PIN login, matching the PIN gate of the existing prototypes. */
  async login({ name, pin }) {
    const user = await userService.findByName(name);
    if (!user || !user.active) throw ApiError.unauthorized('Unknown or disabled account');
    if (!userService.verifyPin(user, pin)) throw ApiError.unauthorized('Wrong PIN');

    /**
     * Note the sign-in for the back office's Users page. Only here, and not on
     * refresh(): a tablet left signed in refreshes by itself all week, so
     * counting that would report a person at a machine who has not touched it.
     *
     * A stamp that fails is logged and swallowed. The crew is standing at the
     * tablet with the right PIN, and a column the office reads is no reason to
     * refuse them the shift.
     */
    try {
      await userService.touchLogin(user.id);
    } catch (err) {
      logger.warn(`Sign-in by ${user.name} was not stamped - ${err.message}`);
    }

    return { user: publicUser(user), tokens: issueTokens(user) };
  },

  /**
   * Rotation: the token handed in is spent and a fresh pair goes back, so a
   * cookie copied off a tablet stops working as soon as the tablet itself
   * refreshes. The short grace window is what keeps that from signing the crew
   * out over a second browser tab or a retried request - see revoke().
   */
  async refresh(refreshToken) {
    const claims = verifyRefreshToken(refreshToken);
    const user = await userService.findById(claims.sub);
    if (!user?.active) throw ApiError.unauthorized('Account is disabled');
    revoke(claims.jti, claims.exp, env.jwt.refreshGraceMs);
    return { user: publicUser(user), tokens: issueTokens(user) };
  },

  /**
   * Signing out ends the session itself, not just the cookie holding it.
   *
   * It is also what takes the name off the manager's nav bar. That has to
   * happen here rather than by letting the presence window run out, because the
   * window is a quarter of an hour and the person has left the plant - so the
   * stamp is written from the claims on the token being spent, which is the
   * only place the account is named on this route.
   *
   * The write is not waited for and cannot fail the sign-out: the session is
   * already revoked by then, and refusing to sign somebody out because a column
   * would not take a timestamp is the wrong way round.
   */
  signOut(refreshToken) {
    if (!refreshToken) return;
    try {
      const claims = verifyRefreshToken(refreshToken);
      revoke(claims.jti, claims.exp);
      userService
        .touchLogout(claims.sub)
        .catch((err) => logger.warn(`Sign-out by ${claims.sub} was not stamped - ${err.message}`));
    } catch {
      // Already expired, forged or revoked - nothing left to end.
    }
  },

  async me(userId) {
    return publicUser(await userService.findById(userId));
  },
};

export default authService;
