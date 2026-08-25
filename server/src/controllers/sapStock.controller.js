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
 * nothing next to one saying "1,284 rows, 61,940 kg, stored as sync abc123".
 */
export const receive = asyncHandler(async (req, res) => {
  const { sync, rows } = await sapStockService.record(req.body);
  logger.info(
    `SAP stock: ${rows} rows accepted, as of ${sync.as_of}, total ${sync.total_qty ?? '-'}`,
  );
  return created(
    res,
    {
      syncId: sync.id,
      asOf: sync.as_of,
      receivedAt: sync.received_at,
      rows: sync.rows,
      totalQty: sync.total_qty,
    },
    `Stored ${rows} stock rows`,
  );
});

/** The yard as it stands, with how old it is. Both, always - see the service. */
export const current = asyncHandler(async (req, res) =>
  ok(res, await sapStockService.current(req.query)),
);
