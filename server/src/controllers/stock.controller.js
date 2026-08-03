import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/ApiResponse.js';
import { stockService } from '../services/stock.service.js';

/** The whole yard, dispatched counts and all. Manager only - see stock.routes.js. */
export const list = asyncHandler(async (req, res) => paginated(res, await stockService.list(req.query)));

/**
 * What a supervisor may see: the label, the grade, what is left and the lab's
 * verdict. A different serializer from the one above rather than that one with
 * fields taken out - the shop floor's copy of this response has never held a
 * price or a customer, so there is nothing in it to leak.
 */
export const summary = asyncHandler(async (req, res) =>
  paginated(res, await stockService.summary(req.query)),
);

/**
 * The coarse pools, each with its three sample points and whichever of them the
 * lab has filled. What the Quality tab lists coarse under, and where the yard
 * card's "n of 3 sampled" is counted from.
 */
export const pools = asyncHandler(async (req, res) =>
  paginated(res, await stockService.pools(req.query)),
);

/**
 * What the presses have made and where it stands with the lab. The bench's
 * third list, beside the batches and the coarse pools - a moulded group is
 * keyed on its product and pack and appears on neither of the others.
 */
export const moulded = asyncHandler(async (req, res) =>
  paginated(res, await stockService.moulded(req.query)),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await stockService.findById(req.params.id)),
);

/**
 * The back office setting a verdict directly.
 *
 * Signed with the authenticated account rather than with anything in the body.
 * This is the one path onto `qc_status` that has no lab test behind it - a pool
 * put on hold, a pack the office satisfied itself about - so without the account
 * on the row there is no record at all of who released the goods, and this is
 * precisely the write somebody eventually asks that about.
 */
export const setQc = asyncHandler(async (req, res) =>
  ok(
    res,
    await stockService.setQcStatus(req.params.id, req.body.qc_status, req.user?.id ?? null),
    'QC status saved',
  ),
);
