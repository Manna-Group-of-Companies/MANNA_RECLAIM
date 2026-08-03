import { z } from 'zod';
import { gradeEnum, isoDate } from './common.validation.js';
import { LOADING_MODES, LOADING_MATERIALS, STOCK_UNITS } from '../config/constants.js';

/**
 * One line of a dispatch: which stock, and how much of it.
 *
 * There is deliberately no price here. The price is agreed per quality, not per
 * pallet - a customer is quoted a rate for Fine, and every sack of Fine on the
 * document goes at it - so it lives in `prices` on the header and the server
 * puts it onto the lines. Two lines off two batches of the same grade cannot
 * therefore go out at two different figures, which is what a per-line price
 * makes possible and nobody ever intends.
 *
 * `quality` is optional and advisory. The group already knows its own grade and
 * the server prices against that, so a client cannot re-label what it is buying
 * into a cheaper bracket. It is a plain string rather than the grade enum
 * because a moulded group's quality is the product it is - the presses make
 * loops, not a grade of rubber - and either way the server ignores what arrives.
 *
 * `qty` is the count, in whatever the group is counted in. `sacks` is the older
 * name for the same field and is still accepted, so a client that has not been
 * rebuilt keeps posting; one of the two has to be there. `unit` is likewise
 * advisory - post_dispatch() writes the group's own unit onto the line, and
 * refuses a request that named a different one rather than repricing it.
 */
export const dispatchLineSchema = z
  .object({
    stock_group_id: z.string().uuid(),
    quality: z.string().trim().max(60).optional().nullable(),
    qty: z.coerce.number().int().positive().optional(),
    sacks: z.coerce.number().int().positive().optional(),
    unit: z.enum(STOCK_UNITS).optional(),
  })
  .refine((line) => line.qty != null || line.sacks != null, {
    message: 'A line has to say how much is going out',
    path: ['qty'],
  });

/**
 * The rate given to the customer, one figure per quality on the document.
 *
 * A single value - not a list price with a negotiated rate beside it, and not a
 * rate the form applies quietly from the card. The manager types what this
 * customer is paying. Every quality being dispatched has to appear here: the
 * check that none was left out is in the service, where the groups have been
 * read and the qualities actually on the document are known, and it answers 422
 * naming the quality rather than a generic refusal.
 *
 * Keyed on a plain string rather than the grade enum, because the presses put
 * products on this document beside grades - a price for LOOP is a price per
 * piece of LOOP, and the enum would refuse it. Nothing is lost by widening it:
 * a key that names no quality on the document is simply never looked up, and the
 * check that every quality *was* priced is the one that matters and is in the
 * service where the groups are known.
 */
export const dispatchPricesSchema = z
  .record(
    z.string().trim().min(1).max(60),
    z.coerce.number().positive('A price above zero is required'),
  )
  .refine((prices) => Object.keys(prices).length > 0, {
    message: 'A selling price is needed for every quality being dispatched',
  });

/**
 * The loading job, costed.
 *
 * `loading_mode` is accepted and then largely ignored: what the entry is
 * actually stored as is derived from what was entered, in loadingEntry(). A
 * contract load with day labour on it becomes `mixed` whatever this field says,
 * because the rule is that every day-labour worker's time is accounted in
 * man-hours and a rule enforced by a dropdown is not enforced. Sending the
 * field at all is a convenience for the form, not a decision the client makes.
 *
 * Neither rate is accepted from the request. Both are read from the settings on
 * the server and snapshotted onto the entry, so a client cannot post a job at a
 * rate of its own choosing, and a later revision of the settings cannot reprice
 * a job already done.
 *
 * The whole object is optional. A dispatch loaded by the customer's own crew
 * has no loading cost to the plant, and that is recorded as no entry rather
 * than as an entry full of zeroes - the dispatch list flags it either way.
 */
export const loadingSchema = z.object({
  loading_mode: z.enum(LOADING_MODES).optional(),
  material_kind: z.enum(LOADING_MATERIALS).optional().default('reclaim'),
  /** Defaults to the sacks on the document at 50 kg a sack; override for a weighbridge net. */
  kg_loaded: z.coerce.number().min(0).optional().nullable(),
  manhour_labourers: z.coerce.number().int().min(0).optional().default(0),
  manhour_hours: z.coerce.number().min(0).max(24).optional().default(0),
  vehicle_no: z.string().trim().max(32).optional().nullable(),
  remarks: z.string().trim().max(300).optional().nullable(),
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
  prices: dispatchPricesSchema,
  loading: loadingSchema.optional().nullable(),
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
