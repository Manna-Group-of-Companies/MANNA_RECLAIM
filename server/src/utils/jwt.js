import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const payloadOf = (user) => ({ sub: user.id, role: user.role, name: user.name });

export const signAccessToken = (user) =>
  jwt.sign(payloadOf(user), env.jwt.secret, { expiresIn: env.jwt.expiresIn });

export const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });

export const issueTokens = (user) => ({
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user),
});

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized('Session expired, sign in again');
  }
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.refreshSecret);
  } catch (err) {
    throw ApiError.unauthorized('Invalid refresh token');
  }
};

export default { signAccessToken, signRefreshToken, issueTokens, verifyAccessToken, verifyRefreshToken };
