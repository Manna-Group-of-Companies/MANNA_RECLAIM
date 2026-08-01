import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { customerService } from '../services/customer.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await customerService.list(req.query)),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await customerService.findById(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await customerService.create(req.body), 'Customer added'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await customerService.update(req.params.id, req.body), 'Customer updated'),
);

/** What has gone out to them, each document with the lines it was made of. */
export const dispatches = asyncHandler(async (req, res) => {
  const { customer, rows, total, page, limit } = await customerService.dispatchHistory(
    req.params.id,
    req.query,
  );
  return paginated(res, { rows, total, page, limit }, 'OK', { customer });
});

/**
 * What this customer last paid per grade - the dispatch form's prefill. It is
 * offered for confirmation on every line rather than applied quietly, because a
 * price carried over from months ago is exactly what goes out wrong unnoticed.
 */
export const lastPrices = asyncHandler(async (req, res) =>
  ok(res, await customerService.lastPrices(req.params.id)),
);
