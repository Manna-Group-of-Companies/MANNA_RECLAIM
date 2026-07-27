import { defineModel } from './base.model.js';
import { DISPATCH_GRADES } from '../config/constants.js';

export const Customer = defineModel(
  'Customer',
  'customers',
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    gst: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  (schema) => {
    schema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  },
);

/** Negotiated per-kg rate. Absent here means the PRICE_LIST rate applies. */
export const Rate = defineModel(
  'Rate',
  'rates',
  {
    customer: { type: String, required: true, index: true },
    grade: { type: String, enum: DISPATCH_GRADES, required: true },
    rate: { type: Number, required: true },
    note: { type: String, default: null },
  },
  (schema) => {
    // rateService.upsertRate() upserts on this pair.
    schema.index({ customer: 1, grade: 1 }, { unique: true });
  },
);

export default Rate;
