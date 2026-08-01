import { z } from 'zod';
import { QC_STATUSES } from '../config/constants.js';
import { listQuery } from './common.validation.js';

/**
 * What the yard may be filtered by. Nothing here writes: both counts on a stock
 * group are moved by Postgres, from packing and from posting a dispatch, so
 * there is no shape for "set the stock level" to validate.
 */
export const stockQuery = listQuery.extend({
  quality: z.string().trim().max(40).optional(),
  qc_status: z.enum(QC_STATUSES).optional(),
  kind: z.enum(['batch', 'pool']).optional(),
});

/**
 * The lab's verdict on a group. The one write on this table, and the only door
 * between packed stock and a vehicle: post_dispatch() refuses anything that is
 * not `pass`.
 */
export const qcStatusSchema = z.object({ qc_status: z.enum(QC_STATUSES) });
