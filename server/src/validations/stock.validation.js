import { z } from 'zod';
import { QC_STATUSES, STOCK_KINDS, STOCK_UNITS } from '../config/constants.js';
import { listQuery } from './common.validation.js';

/**
 * What the yard may be filtered by. Nothing here writes: both counts on a stock
 * group are moved by Postgres, from packing and from posting a dispatch, so
 * there is no shape for "set the stock level" to validate.
 *
 * `quality` is a plain string of a length that covers both a grade and a product
 * code, because a moulded group's quality is the product it is.
 */
export const stockQuery = listQuery.extend({
  quality: z.string().trim().max(60).optional(),
  qc_status: z.enum(QC_STATUSES).optional(),
  kind: z.enum(STOCK_KINDS).optional(),
  unit: z.enum(STOCK_UNITS).optional(),
});

/**
 * The lab's verdict on a group. The one write on this table, and the only door
 * between packed stock and a vehicle: post_dispatch() refuses anything that is
 * not `pass`.
 *
 * Who set it is not in the body. It is the authenticated account, taken from the
 * request in the controller - a signature the caller could type would be worth
 * nothing as a record of who released the goods.
 */
export const qcStatusSchema = z.object({ qc_status: z.enum(QC_STATUSES) });
