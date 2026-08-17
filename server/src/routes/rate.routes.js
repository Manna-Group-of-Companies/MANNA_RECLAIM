import { Router } from 'express';
import * as rates from '../controllers/rate.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { DISPATCH_ROLES } from '../config/constants.js';
import { bulkListQuery } from '../validations/common.validation.js';
import { rateSchema, customerSchema } from '../validations/dispatch.validation.js';
import {
  costRatesSchema,
  idealValuesSchema,
  labourRateSchema,
} from '../validations/report.validation.js';

const router = Router();

router.use(authenticate);

/**
 * The selling side: the customer list, the rate card, the standard price list
 * and a quote for one customer and grade.
 *
 * These four carried no role gate at all - only the `authenticate` above - and
 * that was a hole rather than a policy. `/customers` here answers off the
 * customers table with `select: '*'`, so it is the whole record including phone
 * and address, and `/` is customer_rates, which is what every customer has
 * negotiated for every grade. Any signed-in account could read both, including
 * a worker and a lab account, which quietly made the wall on /customers
 * meaningless: the list was one route away the whole time.
 *
 * The comment that used to sit here said "the floor needs the selling side to
 * price a dispatch note". That was true when the floor dispatched, stopped
 * being true when the form moved to the office, and was never narrowed to match
 * either time - so the gate is now written down rather than assumed.
 *
 * Gated on who may raise a dispatch, which is the yard and the office. That
 * widens nothing in practice - the only screen that reads any of these is the
 * admin Rates page - and it shuts worker and lab out of the customer list and
 * the rate card, which is a tightening on today.
 *
 * All read whole: the dispatch form prices every line off the card, so a page
 * of it is no use. See bulkListQuery.
 */
const forDispatch = authorize(...DISPATCH_ROLES);

router.get('/customers', forDispatch, validate({ query: bulkListQuery }), rates.listCustomers);
router.get('/price-list', forDispatch, rates.priceList);
router.get('/quote', forDispatch, rates.quote);
router.get('/', forDispatch, validate({ query: bulkListQuery }), rates.listRates);

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

/**
 * The two figures a loading job is costed by, for the dispatch form's running
 * total. Open to whoever may raise a dispatch, which is now the yard as well.
 *
 * Its own route rather than widening `/cost-rates` above, because that carries
 * the whole cost model - the overheads, the interest rate, what a kg of crumb
 * costs to make - and the yard needing to see what a lorry costs to load is no
 * reason to hand over any of that. Two numbers, and they are the two the form
 * already puts on screen.
 */
router.get('/loading-rates', forDispatch, rates.loadingRates);

/**
 * The labour rate with the date it came into force. Behind the same door as the
 * cost rates and for the same reason: it is what the picking gang, the cracker
 * crew and the grinders are costed at, so whoever can move it moves the plant's
 * cost per kg.
 */
/**
 * The plant's benchmarks - what a shift ought to produce, how many charges a
 * vessel ought to take, what a kg ought to cost in energy and in labour-hours.
 *
 * Behind the same door as the cost rates. These are what a shift is judged
 * against, so whoever can move them can move what counts as a good shift - and
 * the screen that shows them is the same back-office one that shows the costing.
 */
router.get('/ideal-values', adminOnly, rates.idealValues);
router.put('/ideal-values', adminOnly, validate({ body: idealValuesSchema }), rates.saveIdealValues);

router.get('/labour-rates', adminOnly, rates.labourRates);
router.post(
  '/labour-rates',
  adminOnly,
  validate({ body: labourRateSchema }),
  rates.saveLabourRate,
);

// the rate card is edited from the admin side only
router.post('/customers', adminOnly, validate({ body: customerSchema }), rates.createCustomer);
router.put('/', adminOnly, validate({ body: rateSchema }), rates.upsertRate);
router.put('/cost-rates', adminOnly, validate({ body: costRatesSchema }), rates.saveCostRates);

export default router;
