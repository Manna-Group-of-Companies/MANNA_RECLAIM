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

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await stockService.findById(req.params.id)),
);

export const setQc = asyncHandler(async (req, res) =>
  ok(res, await stockService.setQcStatus(req.params.id, req.body.qc_status), 'QC status saved'),
);
