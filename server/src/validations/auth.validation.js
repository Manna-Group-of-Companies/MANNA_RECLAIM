import { z } from 'zod';

export const loginSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
  role: z.enum(['worker', 'supervisor', 'lab', 'manager', 'admin']).default('supervisor'),
  active: z.boolean().default(true),
});

export const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) });
