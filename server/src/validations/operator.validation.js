import { z } from 'zod';
import { isoDate, shiftEnum } from './common.validation.js';
import { OPERATOR_STATION_KEYS } from '../config/constants.js';

/** Built off the list rather than written out, so the two cannot drift. */
const stationEnum = z.enum(OPERATOR_STATION_KEYS);

export const operatorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** What they are usually on - a hint for the picker, never a rule. */
  station: stationEnum.optional().nullable(),
  note: z.string().max(300).optional().nullable(),
});

/**
 * What may be changed about an operator.
 *
 * `active` is here and a delete is not. The shifts already recorded against
 * somebody are part of the plant's record, so standing them down leaves the
 * history where it is - the same reasoning the machine list works on.
 */
export const operatorEditSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    station: stationEnum.optional().nullable(),
    note: z.string().max(300).optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

/** The shift a roster is being read for. */
export const rosterQuery = z.object({ date: isoDate, shift: shiftEnum }).passthrough();

/**
 * Putting somebody on a station for a shift.
 *
 * A null `operatorId` is how a station is cleared - saying "nobody" is a real
 * answer and a different one from never having been asked, so it is a value
 * rather than a missing field.
 */
export const assignSchema = z.object({
  date: isoDate,
  shift: shiftEnum,
  station: stationEnum,
  operatorId: z.string().min(1).optional().nullable(),
});
