import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE = 'refreshToken';
/**
 * httpOnly keeps the refresh token out of reach of any script on the page, so
 * an XSS bug cannot walk off with a 30-day session. The SameSite and Secure
 * halves are deployment-shaped and come from the environment - see env.cookie.
 */
const cookieOpts = {
  httpOnly: true,
  sameSite: env.cookie.sameSite,
  secure: env.cookie.secure,
  domain: env.cookie.domain,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};
/** clearCookie only matches when the flags match the ones it was set with. */
const clearOpts = {
  httpOnly: true,
  sameSite: env.cookie.sameSite,
  secure: env.cookie.secure,
  domain: env.cookie.domain,
  path: '/',
};

export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts);
  return ok(res, { user, accessToken: tokens.accessToken }, 'Signed in');
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('No refresh token');
  const { user, tokens } = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts);
  return ok(res, { user, accessToken: tokens.accessToken }, 'Session refreshed');
});

export const logout = asyncHandler(async (req, res) => {
  authService.signOut(req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken);
  res.clearCookie(REFRESH_COOKIE, clearOpts);
  return ok(res, null, 'Signed out');
});

export const me = asyncHandler(async (req, res) => ok(res, await authService.me(req.user.id)));

export const register = asyncHandler(async (req, res) =>
  created(res, await userService.create(req.body), 'Account created'),
);
