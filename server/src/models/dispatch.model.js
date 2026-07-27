import { defineModel } from './base.model.js';
import { DISPATCH_GRADES } from '../config/constants.js';

/** Dispatch header - one customer, one grade, one day. */
export const Dispatch = defineModel(
  'Dispatch',
  'dispatches',
  {
    customer: { type: String, required: true, index: true },
    grade: { type: String, enum: DISPATCH_GRADES, required: true, index: true },
    dispatch_date: { type: String, required: true, index: true },
    invoice_no: { type: String, default: null },
    vehicle: { type: String, default: null },
    driver: { type: String, default: null },
    total_kg: { type: Number, default: null },
    status: { type: String, enum: ['draft', 'dispatched', 'invoiced'], default: 'draft', index: true },
    remarks: { type: String, default: null },
    created_by: { type: String, default: null },
  },
);

/** Individual weighed loads belonging to a dispatch. */
export const DispatchLoad = defineModel(
  'DispatchLoad',
  'dispatch_loads',
  {
    dispatch_id: { type: String, required: true, index: true },
    vehicle: { type: String, default: null },
    driver: { type: String, default: null },
    gross_kg: { type: Number, default: null },
    tare_kg: { type: Number, default: null },
    net_kg: { type: Number, default: null },
    bags: { type: Number, default: null },
  },
);

export default Dispatch;
