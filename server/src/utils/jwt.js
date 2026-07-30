import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { isRevoked } from './tokenDenylist.js';

/**
 * Both token types are HS256 and nothing else.
 *
 * `algorithms` on verify is the half that matters: without it jsonwebtoken
 * accepts whatever the token's own header asks for, which is how a token
 * arrives claiming a different algorithm and is believed anyway.
 */
const ALGORITHMS = ['HS256'];

const signOpts = (expiresIn) => ({
  algorithm: 'HS256',
  expiresIn,
  issuer: env.jwt.issuer,
  audience: env.jwt.audience,
});

const verifyOpts = { algorithms: ALGORITHMS, issuer: env.jwt.issuer, audience: env.jwt.audience };

const payloadOf = (user) => ({ sub: user.id, role: user.role, name: user.name });

export const signAccessToken = (user) =>
  jwt.sign(payloadOf(user), env.jwt.secret, signOpts(env.jwt.expiresIn));

/**
 * The refresh token carries a `jti` so one session can be named later - that is
 * what signing out and rotation revoke. See utils/tokenDenylist.js.
 */
export const signRefreshToken = (user, jti = randomUUID()) =>
  jwt.sign(
    { sub: user.id, type: 'refresh', jti },
    env.jwt.refreshSecret,
    signOpts(env.jwt.refreshExpiresIn),
  );

export const issueTokens = (user) => ({
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user),
});

export const verifyAccessToken = (token) => {
  try {
    const claims = jwt.verify(token, env.jwt.secret, verifyOpts);
    // A refresh token is signed with the other secret, so it cannot normally
    // reach here - this is what holds if the two are ever set to one value.
    if (claims.type === 'refresh') throw new Error('refresh token used as access token');
    return claims;
  } catch {
    throw ApiError.unauthorized('Session expired, sign in again');
  }
};

export const verifyRefreshToken = (token) => {
  let claims;
  try {
    claims = jwt.verify(token, env.jwt.refreshSecret, verifyOpts);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  if (claims.type !== 'refresh') throw ApiError.unauthorized('Invalid refresh token');
  // Signed out, or already spent on a rotation.
  if (claims.jti && isRevoked(claims.jti)) {
    throw ApiError.unauthorized('Session has been signed out');
  }
  return claims;
};

export default { signAccessToken, signRefreshToken, issueTokens, verifyAccessToken, verifyRefreshToken };
