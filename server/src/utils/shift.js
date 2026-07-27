import { SHIFTS, SHIFT_WINDOW } from '../config/constants.js';

export const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);

/** Day shift covers 08:30-20:30; everything else is night. */
export const shiftForMinutes = (mins) =>
  mins >= SHIFT_WINDOW.dayStart && mins < SHIFT_WINDOW.dayEnd ? SHIFTS.DAY : SHIFTS.NIGHT;

export const currentShift = (d = new Date()) => shiftForMinutes(d.getHours() * 60 + d.getMinutes());

/** A night shift that starts before midnight keeps the previous calendar date. */
export const shiftKey = (date, shift) => date + '|' + shift;

export default { todayISO, shiftForMinutes, currentShift, shiftKey };
