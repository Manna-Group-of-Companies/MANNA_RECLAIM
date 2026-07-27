import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import machinesReducer from '@/features/machines/machinesSlice';
import runsReducer from '@/features/machines/runsSlice';
import batchesReducer from '@/features/batches/batchesSlice';
import dispatchReducer from '@/features/dispatch/dispatchSlice';
import reportsReducer from '@/features/reports/reportsSlice';
import maintenanceReducer from '@/features/maintenance/maintenanceSlice';
import ratesReducer from '@/features/rates/ratesSlice';
import uiReducer from '@/features/ui/uiSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  machines: machinesReducer,
  runs: runsReducer,
  batches: batchesReducer,
  dispatch: dispatchReducer,
  reports: reportsReducer,
  maintenance: maintenanceReducer,
  rates: ratesReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
