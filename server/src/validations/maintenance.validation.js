import { z } from 'zod';
import { isoDate, shiftEnum } from './common.validation.js';

/**
 * Reporting a breakdown. The shop floor marks a machine DOWN first and writes
 * up the repair later, so everything except the machine is optional here and
 * the write-up arrives through resolveSchema.
 */
export const createMaintenanceSchema = z.object({
  machineId: z.string().min(1),
  machine: z.string().optional().nullable(),
  downStart: z.string().datetime().optional(),
  rootCause: z.string().max(1000).optional().nullable(),
  device: z.string().max(120).optional().nullable(),
});

/**
 * Bringing a machine back online. The prototype insists on all three answers -
 * cause, fix, prevention - before the DOWN flag clears, and the server keeps
 * that rule so a repair cannot be filed as a blank row.
 */
export const resolveSchema = z.object({
  rootCause: z.string().min(1).max(1000),
  resolution: z.string().min(1).max(1000),
  prevention: z.string().min(1).max(1000),
  repairedAt: z.string().datetime().optional(),
  remarks: z.string().max(500).optional(),
});

/** One temperature per bearing / bush position, all taken in one reading. */
export const bearingLogSchema = z.object({
  machineId: z.string().min(1),
  machine: z.string().optional().nullable(),
  kind: z.enum(['bearing', 'bush']).default('bearing'),
  readings: z
    .array(z.object({ position: z.string().min(1), tempC: z.coerce.number().positive() }))
    .min(1)
    .max(8),
  supervisor: z.string().max(120).optional().nullable(),
  shiftDate: isoDate.optional(),
  shift: shiftEnum.optional(),
  ts: z.string().datetime().optional(),
  remarks: z.string().max(300).optional().nullable(),
});
