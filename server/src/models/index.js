import { TABLES } from '../config/constants.js';
import { defineLooseModel } from './base.model.js';
import { User } from './user.model.js';
import { Machine } from './machine.model.js';
import { Batch } from './batch.model.js';
import { Run } from './run.model.js';
import { Dispatch, DispatchLoad } from './dispatch.model.js';
import { QualityTest } from './quality.model.js';
import { Maintenance, BearingLog } from './maintenance.model.js';
import { Customer, Rate } from './rate.model.js';
import { EfficiencyNote } from './efficiency.model.js';
import { Vehicle, Driver, Shift } from './fleet.model.js';

export {
  User, Machine, Batch, Run, Dispatch, DispatchLoad,
  QualityTest, Maintenance, BearingLog, Customer, Rate, Vehicle, Driver, Shift,
  EfficiencyNote,
};

/**
 * Collection name -> model. Keyed by the TABLES values so the services layer
 * can keep asking for `crud(TABLES.batches)` exactly as it did before.
 */
export const models = {
  [TABLES.users]: User,
  [TABLES.shifts]: Shift,
  [TABLES.machines]: Machine,
  [TABLES.batches]: Batch,
  [TABLES.runs]: Run,
  [TABLES.dispatches]: Dispatch,
  [TABLES.dispatchLoads]: DispatchLoad,
  [TABLES.qualityTests]: QualityTest,
  [TABLES.maintenance]: Maintenance,
  [TABLES.bearingLogs]: BearingLog,
  [TABLES.customers]: Customer,
  [TABLES.rates]: Rate,
  [TABLES.vehicles]: Vehicle,
  [TABLES.drivers]: Driver,

  // Collections copied over from Supabase with their original columns. They are
  // read-only as far as the API is concerned, so a loose schema is enough.
  [TABLES.sharedState]: defineLooseModel('SharedState', TABLES.sharedState),
  [TABLES.customerRates]: defineLooseModel('CustomerRate', TABLES.customerRates),
  [TABLES.priceList]: defineLooseModel('PriceListRow', TABLES.priceList),
  [TABLES.materialRates]: defineLooseModel('MaterialRate', TABLES.materialRates),
  [TABLES.costRates]: defineLooseModel('CostRate', TABLES.costRates),
  [TABLES.conversions]: defineLooseModel('Conversion', TABLES.conversions),
  [TABLES.formulations]: defineLooseModel('Formulation', TABLES.formulations),
  [TABLES.machineTargets]: defineLooseModel('MachineTarget', TABLES.machineTargets),
  [TABLES.efficiencyNotes]: EfficiencyNote,
  [TABLES.machineShiftEfficiency]: defineLooseModel('MachineShiftEfficiency', TABLES.machineShiftEfficiency),
  [TABLES.shiftActivity]: defineLooseModel('ShiftActivity', TABLES.shiftActivity),
  [TABLES.shiftCosting]: defineLooseModel('ShiftCosting', TABLES.shiftCosting),
  [TABLES.specialBatchDetail]: defineLooseModel('SpecialBatchDetail', TABLES.specialBatchDetail),
  [TABLES.coarseShiftDetail]: defineLooseModel('CoarseShiftDetail', TABLES.coarseShiftDetail),
};

export function modelFor(collection) {
  const model = models[collection];
  if (!model) throw new Error('No mongoose model registered for collection "' + collection + '"');
  return model;
}

export default models;
