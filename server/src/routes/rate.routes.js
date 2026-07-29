import { Router } from 'express';
import * as rates from '../controllers/rate.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { listQuery } from '../validations/common.validation.js';
import { rateSchema } from '../validations/dispatch.validation.js';
import { costRatesSchema } from '../validations/report.validation.js';

const router = Router();

router.use(authenticate);

router.get('/customers', validate({ query: listQuery }), rates.listCustomers);
router.get('/price-list', rates.priceList);
router.get('/quote', rates.quote);
router.get('/cost-rates', rates.costRates);
router.get('/', validate({ query: listQuery }), rates.listRates);

// the rate card is edited from the admin side only
router.post('/customers', adminOnly, rates.createCustomer);
router.put('/', adminOnly, validate({ body: rateSchema }), rates.upsertRate);
router.put('/cost-rates', adminOnly, validate({ body: costRatesSchema }), rates.saveCostRates);

export default router;
