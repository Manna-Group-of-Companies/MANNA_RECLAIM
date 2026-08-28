import { z } from 'zod';
import { SHIFTS } from '../config/constants.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD');
const shift = z.enum([SHIFTS.DAY, SHIFTS.NIGHT]);

/**
 * A window of punches as the reader holds them.
 *
 * `date` and `time` are the device's own clock and are sent as it reads them,
 * not as an instant. The plant is on IST and this API is not, and a punch at ten
 * past midnight parsed in the wrong zone lands on the wrong shift of the wrong
 * day - see attendance.service.
 *
 * `time` takes HH:MM or HH:MM:SS because the readers differ and neither is worth
 * a rejected sync.
 */
export const punchWindow = z.object({
  device: z.string().min(1).max(120),
  asOf: z.string().max(40).optional(),
  punches: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        name: z.string().max(120).nullish(),
        date: isoDate,
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'A time as HH:MM'),
        direction: z.enum(['in', 'out', 'IN', 'OUT']).nullish(),
      }),
    )
    .max(20000),
});

export const shiftQuery = z.object({ date: isoDate, shift });

/** A null station is "take them off wherever they were", not a bad request. */
export const assignBody = z.object({
  date: isoDate,
  shift,
  code: z.string().min(1).max(40),
  station: z.string().min(1).max(40).nullable(),
  by: z.string().max(80).optional(),
});

export const claimBody = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  station: z.string().max(40).nullish(),
  by: z.string().max(80).optional(),
});
