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

/**
 * What an admin may change about an account.
 *
 * Named rather than passed through, because `pin_hash` is a writable column: an
 * unvalidated patch reached it directly, and a hash written by hand is a PIN
 * nobody can log in with - or one only the writer knows. Changing a PIN goes
 * through PATCH /users/:id/pin, which hashes it. Unlisted keys are dropped.
 */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    role: z.enum(['worker', 'supervisor', 'lab', 'manager', 'admin']).optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

export const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) });
