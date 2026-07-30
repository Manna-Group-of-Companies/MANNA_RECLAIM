import { z } from 'zod';
import { MACHINE_KINDS } from '../config/constants.js';

/**
 * A machine on the plant's list.
 *
 * Every setting is optional bar the name and the kind: the list was migrated
 * from the prototype's hard-coded array and not every machine has a capacity,
 * an accent colour or a default tyre type recorded. What the schema is here for
 * is to keep the writable column list from being the only thing standing
 * between a stray payload and the row - and to keep `kind` inside the vocabulary
 * the rest of the server switches on, since a machine of an unknown kind falls
 * through every rule that decides whether it weighs, needs quality or logs
 * bearings.
 */
const flag = z.boolean().optional().nullable();
const text = (max) => z.string().trim().max(max).optional().nullable();

export const createMachineSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(80),
  short: text(20),
  kind: z.enum(MACHINE_KINDS),
  group_name: text(60),
  sub: text(60),
  accent: text(30),
  capacity: z.coerce.number().min(0).optional().nullable(),
  out_weight: z.coerce.number().min(0).optional().nullable(),
  needs_quality: flag,
  weigh: flag,
  tyre: flag,
  def_tyre: text(40),
  enabled: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export const updateMachineSchema = createMachineSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

/** PATCH /machines/:id/enabled - the one machine write the admin UI makes. */
export const toggleMachineSchema = z.object({ enabled: z.boolean() });
