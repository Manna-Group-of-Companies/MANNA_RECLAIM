import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { rateService } from '../services/rate.service.js';

export const listCustomers = asyncHandler(async (req, res) =>
  paginated(res, await rateService.customers.list(req.query)),
);

export const createCustomer = asyncHandler(async (req, res) =>
  created(res, await rateService.customers.create(req.body), 'Customer added'),
);

export const listRates = asyncHandler(async (req, res) =>
  paginated(res, await rateService.listRates(req.query)),
);

export const priceList = asyncHandler(async (_req, res) => ok(res, rateService.priceList));

export const upsertRate = asyncHandler(async (req, res) =>
  ok(res, await rateService.upsertRate(req.body), 'Rate saved'),
);

export const quote = asyncHandler(async (req, res) =>
  ok(res, await rateService.rateForAsync(req.query.customer, req.query.grade)),
);
