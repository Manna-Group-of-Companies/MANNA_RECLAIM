import { z } from 'zod';
import { gradeEnum, isoDate } from './common.validation.js';

export const createDispatchSchema = z.object({
  customer: z.string().min(1),
  grade: gradeEnum,
  dispatch_date: isoDate,
  invoice_no: z.string().optional().nullable(),
  vehicle: z.string().optional().nullable(),
  /** One of the plant's own vehicles, rather than a hired or customer one. */
  own_vehicle: z.boolean().optional().nullable(),
  driver: z.string().optional().nullable(),
  total_kg: z.coerce.number().min(0).optional().nullable(),
  status: z.enum(['draft', 'dispatched', 'invoiced']).default('draft'),
  remarks: z.string().max(500).optional().nullable(),
});

export const updateDispatchSchema = createDispatchSchema.partial();

export const addLoadSchema = z.object({
  vehicle: z.string().optional().nullable(),
  driver: z.string().optional().nullable(),
  grossKg: z.coerce.number().min(0).optional().nullable(),
  tareKg: z.coerce.number().min(0).optional().nullable(),
  netKg: z.coerce.number().min(0).optional().nullable(),
  bags: z.coerce.number().int().min(0).optional().nullable(),
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
