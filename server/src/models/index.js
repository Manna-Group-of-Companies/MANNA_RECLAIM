import { TABLES } from '../config/constants.js';
import { User } from './user.model.js';
import { Machine } from './machine.model.js';
import { Batch } from './batch.model.js';
import { Run } from './run.model.js';
import { Dispatch, DispatchLoad } from './dispatch.model.js';
import { QualityTest } from './quality.model.js';
import { Maintenance, BearingLog } from './maintenance.model.js';
import { Customer, Rate } from './rate.model.js';
import { Vehicle, Driver, Shift } from './fleet.model.js';

export {
  User, Machine, Batch, Run, Dispatch, DispatchLoad,
  QualityTest, Maintenance, BearingLog, Customer, Rate, Vehicle, Driver, Shift,
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
};

export function modelFor(collection) {
  const model = models[collection];
  if (!model) throw new Error('No mongoose model registered for collection "' + collection + '"');
  return model;
}

export default models;
