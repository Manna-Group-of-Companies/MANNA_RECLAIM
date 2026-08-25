import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { sapStockService } from '../services/sapStock.service.js';
import { logger } from '../config/logger.js';

/**
 * Stock as SAP holds it: one route in from the plant server, one route out to
 * the app.
 */

/**
 * A snapshot from the scheduled sync on the plant server.
 *
 * The answer says what was actually stored rather than just "ok", because the
 * caller is a script with nobody watching it: the only place a wrong figure
 * gets caught is in the log it writes, and a log line saying "sent" is worth
 * nothing next to one saying "137 rows, 109,023 kg, stored as sync abc123".
 *
 * `totals` is the same shape the read route answers in, so the two ends of
 * this have one vocabulary for "how much" - and it is per unit, because a
 * script comparing one number against its own count would disagree on every
 * run that had a press lot in it if kilograms and pieces were added together.
 *
 * `asOf` comes back as Postgres normalised it, which is UTC. The instant is
 * the one that was sent; the text is not, so it is compared as a timestamp
 * rather than as a string.
 */
export const receive = asyncHandler(async (req, res) => {
  const { sync, rows, byUnit } = await sapStockService.record(req.body);
  const said = Object.entries(byUnit)
    .map(([unit, qty]) => `${qty} ${unit}`)
    .join(' · ');
  logger.info(`SAP stock: ${rows} rows accepted, as of ${sync.as_of}, ${said}`);
  return created(
    res,
    {
      syncId: sync.id,
      asOf: sync.as_of,
      receivedAt: sync.received_at,
      rows: sync.rows,
      totals: { rows: sync.rows, byUnit },
    },
    `Stored ${rows} stock rows`,
  );
});

/** The yard as it stands, with how old it is. Both, always - see the service. */
export const current = asyncHandler(async (req, res) =>
  ok(res, await sapStockService.current(req.query)),
);
