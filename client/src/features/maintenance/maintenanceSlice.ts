import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { maintenanceService } from '@/api/services/maintenance.service';
import { toRequestError } from '@/api/axiosClient';
import type { BearingDue, BearingLog, MaintenanceLog } from '@/types/models';

interface MaintenanceState {
  logs: MaintenanceLog[];
  bearings: BearingLog[];
  due: BearingDue[];
  loading: boolean;
  error: string | null;
}

const initialState: MaintenanceState = {
  logs: [],
  bearings: [],
  due: [],
  loading: false,
  error: null,
};

const fail = (err: unknown) => toRequestError(err).message;

export const fetchMaintenance = createAsyncThunk(
  'maintenance/fetch',
  async (params: { status?: string; machineId?: string } | undefined, { rejectWithValue }) => {
    try {
      return (await maintenanceService.list(params)).rows;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchBearingsDue = createAsyncThunk('maintenance/due', async (_, { rejectWithValue }) => {
  try {
    return await maintenanceService.due();
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const logBearing = createAsyncThunk(
  'maintenance/logBearing',
  async (payload: { machineId: string; kind?: 'bearing' | 'bush'; positions?: string[] }, { rejectWithValue, dispatch }) => {
    try {
      const log = await maintenanceService.logBearing(payload);
      dispatch(fetchBearingsDue());
      return log;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const resolveMaintenance = createAsyncThunk(
  'maintenance/resolve',
  async ({ id, remarks }: { id: string; remarks?: string }, { rejectWithValue }) => {
    try {
      return await maintenanceService.resolve(id, remarks);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

const maintenanceSlice = createSlice({
  name: 'maintenance',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaintenance.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMaintenance.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload;
      })
      .addCase(fetchMaintenance.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchBearingsDue.fulfilled, (state, action) => {
        state.due = action.payload;
      })
      .addCase(logBearing.fulfilled, (state, action) => {
        state.bearings.unshift(action.payload);
      })
      .addCase(resolveMaintenance.fulfilled, (state, action) => {
        state.logs = state.logs.map((l) => (l.id === action.payload.id ? action.payload : l));
      });
  },
});

export default maintenanceSlice.reducer;
