import { z } from 'zod';
import { listQuery } from './common.validation.js';

/** `?q=` is the only thing anyone looks a customer up by. */
export const customerQuery = listQuery.extend({
  q: z.string().trim().max(120).optional(),
  active: z.coerce.boolean().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(400).optional().nullable(),
  region: z.string().trim().max(80).optional().nullable(),
  active: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });
