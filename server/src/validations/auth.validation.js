import { z } from 'zod';
import { ROLES } from '../config/constants.js';

/**
 * Built off ROLES rather than written out, because it was written out twice
 * below and both copies had to be found again when the managing director's role
 * was added. A role the enum does not name is refused here with a 400 that
 * reads like a typo, which is a long way from the truth.
 */
const roleEnum = z.enum(Object.values(ROLES));

export const loginSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
  role: roleEnum.default(ROLES.SUPERVISOR),
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
    role: roleEnum.optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

export const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) });
