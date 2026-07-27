import { defineModel } from './base.model.js';
import { SHIFTS } from '../config/constants.js';

export const Vehicle = defineModel(
  'Vehicle',
  'vehicles',
  {
    reg_no: { type: String, required: true, trim: true },
    name: { type: String, default: null },
    capacity_kg: { type: Number, default: null },
    active: { type: Boolean, default: true },
  },
  (schema) => {
    schema.index({ reg_no: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  },
);

export const Driver = defineModel(
  'Driver',
  'drivers',
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    licence_no: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
);

/** Shift roster - who supervised which shift. */
export const Shift = defineModel(
  'Shift',
  'shifts',
  {
    shift_date: { type: String, required: true, index: true },
    shift: { type: String, enum: Object.values(SHIFTS), required: true },
    supervisor: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  (schema) => {
    schema.index({ shift_date: 1, shift: 1 }, { unique: true });
  },
);

export default Vehicle;
