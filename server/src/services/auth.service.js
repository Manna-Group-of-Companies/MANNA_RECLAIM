import { userService } from './user.service.js';
import { issueTokens, verifyRefreshToken } from '../utils/jwt.js';
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

  async refresh(refreshToken) {
    const claims = verifyRefreshToken(refreshToken);
    const user = await userService.findById(claims.sub);
    if (!user?.active) throw ApiError.unauthorized('Account is disabled');
    return { user: publicUser(user), tokens: issueTokens(user) };
  },

  async me(userId) {
    return publicUser(await userService.findById(userId));
  },
};

export default authService;
