import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Who the browser is allowed to be.
 *
 * POST /auth/login carries a JSON body, so every browser sends an OPTIONS
 * preflight first and reads nothing at all unless that preflight comes back
 * carrying Access-Control-Allow-Origin. When it does not, the console says only
 * "No 'Access-Control-Allow-Origin' header is present on the requested
 * resource" - the login itself never happens, so there is no status code, no
 * response body and no server-side clue beyond one 403 in the log. The whole
 * plant sees a sign-in screen that does nothing.
 *
 * That is what happened: the client has two Cloudflare targets, and only the
 * Workers one was listed while the plant was opening the Pages one. The list is
 * three literals in config/env.js and looks self-evidently right either way,
 * which is exactly why it is asserted here instead - a deployed origin that
 * drops off the list should fail as a red test, not as a dead login page.
 */

const DEPLOYED_ORIGINS = [
  'https://manna-reclaim.pages.dev',
  'https://manna-reclaim.odd-wind-70a0.workers.dev',
];

const preflight = (base, origin) =>
  fetch(base + '/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

test('the deployed clients get past the login preflight', async (t) => {
  const api = await startApi();
  t.after(() => api.stop());

  for (const origin of DEPLOYED_ORIGINS) {
    const res = await preflight(api.base, origin);

    assert.ok(res.ok, origin + ' was refused at the preflight with ' + res.status);
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      origin,
      'without this header the browser discards the reply and the crew cannot sign in',
    );
    // The refresh cookie rides on POST /auth/refresh from another origin, which
    // the browser will not send unless the preflight said credentials are ok.
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true', origin);
  }
});

test('an origin nobody deployed is refused', async (t) => {
  const api = await startApi();
  t.after(() => api.stop());

  const res = await preflight(api.base, 'https://manna-reclaim.pages.dev.example.com');

  assert.equal(res.status, 403, 'a host that merely starts with ours is not ours');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
