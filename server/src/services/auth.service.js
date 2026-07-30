import { userService } from './user.service.js';
import { issueTokens, verifyRefreshToken } from '../utils/jwt.js';
import { revoke } from '../utils/tokenDenylist.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, active: u.active });

export const authService = {
  /** Name + PIN login, matching the PIN gate of the existing prototypes. */
  async login({ name, pin }) {
    const user = await userService.findByName(name);
    if (!user || !user.active) throw ApiError.unauthorized('Unknown or disabled account');
    if (!userService.verifyPin(user, pin)) throw ApiError.unauthorized('Wrong PIN');
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

  /** Signing out ends the session itself, not just the cookie holding it. */
  signOut(refreshToken) {
    if (!refreshToken) return;
    try {
      const claims = verifyRefreshToken(refreshToken);
      revoke(claims.jti, claims.exp);
    } catch {
      // Already expired, forged or revoked - nothing left to end.
    }
  },

  async me(userId) {
    return publicUser(await userService.findById(userId));
  },
};

export default authService;
