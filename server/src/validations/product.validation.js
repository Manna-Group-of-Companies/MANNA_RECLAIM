import { z } from 'zod';

/**
 * A product a press moulds.
 *
 * Every figure is optional and may be sent as null: the plant has not measured
 * its curing settings into this system yet, and a product with nothing but a
 * name is still a product a press can be set up for - the sheets say what is
 * unset rather than inventing it. What is not allowed is a nonsense figure: a
 * cure at 0 °C, a cycle of no minutes, a mould with no cavities.
 */
const positive = z.coerce.number().positive().optional().nullable();

/**
 * A cost input may legitimately be zero - a grade that burns no firewood, a
 * product with no machine time against it - so these take zero and refuse only
 * a negative, which is never a cost.
 */
const nonNegative = z.coerce.number().min(0).optional().nullable();

export const createProductSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().min(1).max(80),
  cureTempC: positive,
  cyclicMin: positive,
  cavities: z.coerce.number().int().positive().max(500).optional().nullable(),
  compoundRate: positive,
  note: z.string().max(300).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),

  /**
   * The other half of a product record: what it is ordered under, what it ships
   * as, which machine it comes off, and the cost inputs behind a unit of it.
   * `code` is unique across the list, which is what an order is matched on.
   */
  code: z.string().trim().max(40).optional().nullable(),
  quality: z.string().trim().max(40).optional().nullable(),
  packSizeKg: positive,

  /**
   * How a moulded product is boxed, and what one piece weighs.
   *
   * `packSizeKg` above is a different figure - what a sack of a reclaim grade
   * weighs - because a moulded product is not sold by weight at all: it is sold
   * by the piece, boxed some number at a time. So `packSize` is a count.
   *
   * Both are optional and stay optional. The presses run whether or not the back
   * office has filled these in, and a product with no pack set boxes as loose
   * pieces and says so in the yard rather than stranding a shift's moulding for
   * want of a settings field. `pieceKg` unset means moulded stock reports no
   * weight, which is honest; a default would be a number nobody measured.
   */
  packSize: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  packLabel: z.string().trim().max(40).optional().nullable(),
  pieceKg: positive,
  machineId: z.string().trim().max(40).optional().nullable(),
  rawMaterialCost: nonNegative,
  firewoodCost: nonNegative,
  powerKwh: nonNegative,
  labourCost: nonNegative,
  machineHours: nonNegative,
});

export const updateProductSchema = createProductSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });
