import { z } from 'zod';
import { gradeEnum, isoDate } from './common.validation.js';

/**
 * One priced line of a dispatch.
 *
 * `unit_price` is required and has to be above zero. There is deliberately no
 * fall back to the rate card here: a list price applied silently is how a load
 * goes out at last quarter's figure and is only noticed on the invoice. The
 * form prefills what this customer last paid for the grade and shows it for
 * confirmation, so the price on the document is always one somebody looked at.
 *
 * `quality` is optional because the group already knows its own grade -
 * post_dispatch() copies it across when a line does not carry one, so a client
 * cannot re-label what it is buying.
 */
export const dispatchLineSchema = z.object({
  stock_group_id: z.string().uuid(),
  quality: gradeEnum.optional().nullable(),
  sacks: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().positive(),
});

/**
 * A whole dispatch, posted in one go.
 *
 * There is no update schema, and no PATCH route that would need one. A dispatch
 * that went out wrong is corrected by a reversal document and a fresh dispatch,
 * so the ledger keeps what happened rather than what someone last thought had
 * happened - and the stock behind it stays something that only moved forward.
 */
export const createDispatchSchema = z.object({
  customer_id: z.string().uuid(),
  dispatch_date: isoDate,
  transport_provided: z.boolean().optional().default(false),
  transport_charge: z.coerce.number().min(0).optional().default(0),
  remarks: z.string().max(500).optional().nullable(),
  lines: z.array(dispatchLineSchema).min(1, 'A dispatch needs at least one line'),
});

export const rateSchema = z.object({
  customer: z.string().min(1),
  grade: gradeEnum,
  rate: z.coerce.number().positive(),
  note: z.string().max(120).optional().nullable(),
});

/** A customer on the rate card. `name` is the table's own key. */
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().max(80).optional().nullable(),
  active: z.boolean().optional(),
});
