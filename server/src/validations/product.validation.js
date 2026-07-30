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
});

export const updateProductSchema = createProductSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });
