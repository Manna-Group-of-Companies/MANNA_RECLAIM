import { z } from 'zod';
import { isoDate } from './common.validation.js';

/**
 * What the plant server's stock sync may post.
 *
 * Written to be strict about the two fields that decide whether a figure means
 * anything - the item it is about and how much of it there is - and forgiving
 * about the rest, because the rest is SAP's vocabulary and this end does not
 * get to insist on it.
 *
 * The whole document is one snapshot. There is no partial update and no "add
 * these rows": a stock figure whose truth lives in another system is only ever
 * replaced, never adjusted, or the two drift and neither can be shown to be
 * right.
 */

const text = (max) => z.string().trim().max(max);

const stockRow = z.object({
  /** SAP's own item code. Required, because it is the only durable key here. */
  sku: text(120).min(1, 'Every row needs the SAP item code as `sku`'),
  description: text(300).optional().nullable(),
  /**
   * What the plant calls it. Deliberately a free string rather than an enum of
   * the plant's grades: an item nobody has mapped yet must still arrive, and be
   * visible as unmapped, rather than being refused at the door. Refused, the
   * stock silently does not exist and nobody goes looking for the mapping.
   */
  grade: text(60).optional().nullable(),
  batch: text(120).optional().nullable(),
  warehouse: text(60).optional().nullable(),
  /**
   * Negative is allowed through.
   *
   * SAP does hold negative on-hand where a delivery was posted before its
   * receipt, and refusing it would mean the whole snapshot bounces because one
   * item is mid-correction. It is a thing to look at, not a thing to lose the
   * yard over, so it arrives and shows as what it is.
   */
  quantity: z.coerce.number().finite(),
  /** kg for reclaim, pieces for moulded goods. Per row, because SAP holds it so. */
  unit: text(20).optional().nullable(),
});

export const sapStockSnapshot = z.object({
  source: text(40).optional(),
  /**
   * When the read happened, not when it was sent.
   *
   * A script that queried at six and posted at nine after three retries is
   * reporting six o'clock's stock, and a screen has to be able to say so. Left
   * out, the server stamps its own arrival time and the two are the same thing
   * - which is the honest answer when nobody told it otherwise.
   */
  asOf: z.string().datetime({ offset: true }).optional(),
  rows: z.array(stockRow).min(1, 'A snapshot with no rows is not a snapshot').max(20000),
});

export const sapStockQuery = z.object({ grade: text(60).optional() }).passthrough();

/**
 * One line of one dispatch document.
 *
 * Strict about the four things that make a line mean something - which
 * document, which item, how much, when - and forgiving about the rest, which is
 * SAP's vocabulary and not this end's to insist on.
 */
const dispatchRow = z.object({
  docNo: text(80).min(1, 'Every line needs the document number as `docNo`'),
  /**
   * `invoice` or `delivery`. Free rather than an enum: this install raises no
   * delivery notes at all, so the enum would be a list of one - and a plant
   * that starts raising them later should not be refused at the door for it.
   */
  docType: text(30).optional().nullable(),
  /**
   * SAP's own line number on the document - `INV1.LineNum`.
   *
   * Optional, and worth sending. It is the only thing that tells two lines of
   * the same item apart, and this install carries no batch on any invoice line
   * - so without it a document holding one item twice cannot be stored.
   */
  lineNum: z.coerce.number().int().optional().nullable(),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'docDate is YYYY-MM-DD').optional().nullable(),
  customer: text(200).optional().nullable(),
  customerCode: text(60).optional().nullable(),
  sku: text(120).min(1, 'Every line needs the SAP item code as `sku`'),
  description: text(300).optional().nullable(),
  grade: text(60).optional().nullable(),
  batch: text(120).optional().nullable(),
  /**
   * Negative is allowed through: a credit note or a return is a real line, and
   * refusing it would bounce the whole window because one document was a
   * correction. It is a thing to look at, not a thing to lose the quarter over.
   */
  quantity: z.coerce.number().finite(),
  unit: text(20).optional().nullable(),
  /**
   * Optional, and null rather than nought where the document carries none - a
   * zero reads as a free delivery, which is a different fact.
   */
  value: z.coerce.number().finite().optional().nullable(),
  currency: text(10).optional().nullable(),
});

export const sapDispatchSnapshot = z.object({
  source: text(40).optional(),
  asOf: z.string().datetime({ offset: true }).optional(),
  /**
   * The window the query covered, so the receiving end knows what it is being
   * given rather than inferring it from the rows. A window whose oldest row is
   * three weeks old is either a quiet month or a query that silently narrowed,
   * and only this can tell them apart.
   */
  from: isoDate.optional(),
  to: isoDate.optional(),
  rows: z.array(dispatchRow).min(1, 'A window with no lines is not a window').max(50000),
});

export const sapDispatchQuery = z
  .object({ grade: text(60).optional(), customer: text(200).optional() })
  .passthrough();
