import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { rateService } from '../services/rate.service.js';
import { LOADING_RATE_KEYS } from '../config/constants.js';

export const listCustomers = asyncHandler(async (req, res) =>
  paginated(res, await rateService.customers.list(req.query)),
);

export const createCustomer = asyncHandler(async (req, res) =>
  created(res, await rateService.customers.create(req.body), 'Customer added'),
);

export const listRates = asyncHandler(async (req, res) =>
  paginated(res, await rateService.listRates(req.query)),
);

export const priceList = asyncHandler(async (_req, res) => ok(res, await rateService.priceList()));

export const upsertRate = asyncHandler(async (req, res) =>
  ok(res, await rateService.upsertRate(req.body), 'Rate saved'),
);

export const quote = asyncHandler(async (req, res) =>
  ok(res, await rateService.rateForAsync(req.query.customer, req.query.grade)),
);

/** The plant's cost inputs - what the Rates tab edits and Costing reads. */
export const costRates = asyncHandler(async (_req, res) => ok(res, await rateService.costRates()));

/**
 * The two figures a loading job is costed by, and nothing else.
 *
 * Carved out of the cost rates above so the dispatch form can show what the
 * load will cost to put on the lorry without the account filling it in being
 * handed the plant's whole cost model - the overheads, the interest rate, what
 * a kg of crumb costs to make. The yard raises dispatch notes now; that is not
 * a reason to open the costing.
 *
 * A running total only. Both figures are read again on the server when the
 * entry is written and snapshotted onto it, so what a screen was shown cannot
 * become what a job was costed at.
 */
export const loadingRates = asyncHandler(async (_req, res) => {
  const { data = {} } = await rateService.costRates();
  ok(res, {
    data: {
      [LOADING_RATE_KEYS.contractPerKg]: Number(data[LOADING_RATE_KEYS.contractPerKg] ?? 0),
      [LOADING_RATE_KEYS.labourPerHour]: Number(data[LOADING_RATE_KEYS.labourPerHour] ?? 0),
    },
  });
});

export const saveCostRates = asyncHandler(async (req, res) =>
  ok(res, await rateService.saveCostRates(req.body.data, req.user?.name), 'Rates saved'),
);

/**
 * The labour rate through time - what an hour of a labourer cost, and from
 * when. Read and written by the back office only: it is what the picking gang,
 * the cracker crew and the grinders are all costed at, so it moves the plant's
 * cost per kg on its own.
 */
export const labourRates = asyncHandler(async (_req, res) =>
  ok(res, await rateService.labourRates()),
);

export const saveLabourRate = asyncHandler(async (req, res) =>
  created(
    res,
    await rateService.saveLabourRate(req.body, req.user?.name),
    'Labour rate saved — runs from that date on are costed at it',
  ),
);
