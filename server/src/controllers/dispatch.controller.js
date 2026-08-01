import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { dispatchService } from '../services/dispatch.service.js';

/**
 * Posting a dispatch is one call and one transaction - see post_dispatch() in
 * supabase/migrations/0001_stock_and_dispatch.sql. The stock draw-down, the QC
 * check and both writes happen inside it, so there is nothing to sequence here
 * and nothing that can be left half-posted.
 *
 * The service turns the function's refusals into a 409 naming the group that
 * was short or on hold, which is what the form puts against the offending line.
 */
export const create = asyncHandler(async (req, res) =>
  created(res, await dispatchService.post(req.body, req.user?.id ?? null), 'Dispatch posted'),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await dispatchService.detailOf(req.params.id)),
);
