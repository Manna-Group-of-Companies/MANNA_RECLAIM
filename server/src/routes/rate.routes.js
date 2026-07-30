import { Router } from 'express';
import * as rates from '../controllers/rate.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { bulkListQuery } from '../validations/common.validation.js';
import { rateSchema, customerSchema } from '../validations/dispatch.validation.js';
import { costRatesSchema } from '../validations/report.validation.js';

const router = Router();

router.use(authenticate);

// The floor needs the selling side to price a dispatch note: the customer list,
// the price list and a quote per grade. It does not need what the plant's own
// costs are.
// Both are read whole - the Dispatch screen prices every line off the rate card,
// so a page of it is no use. See bulkListQuery.
router.get('/customers', validate({ query: bulkListQuery }), rates.listCustomers);
router.get('/price-list', rates.priceList);
router.get('/quote', rates.quote);
router.get('/', validate({ query: bulkListQuery }), rates.listRates);

/**
 * Cost inputs - labour, firewood, power, overheads, the interest rate.
 *
 * These are the figures the Costing tab is built out of, and the reason that
 * tab sits behind both a manager/admin route and a passcode. Read by any
 * signed-in account they were the same figures with the screen taken away, so
 * the route now asks for what the screen already asked for. Only the admin
 * Costing and Rates pages fetch this.
 */
router.get('/cost-rates', adminOnly, rates.costRates);

// the rate card is edited from the admin side only
router.post('/customers', adminOnly, validate({ body: customerSchema }), rates.createCustomer);
router.put('/', adminOnly, validate({ body: rateSchema }), rates.upsertRate);
router.put('/cost-rates', adminOnly, validate({ body: costRatesSchema }), rates.saveCostRates);

export default router;
