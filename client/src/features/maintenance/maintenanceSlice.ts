import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  maintenanceService,
  type BearingReadingPayload,
  type MarkDownPayload,
  type RepairPayload,
} from '@/api/services/maintenance.service';
import { toRequestError } from '@/api/axiosClient';
import type { BearingDue, BearingLog, MaintenanceLog } from '@/types/models';

interface MaintenanceState {
  logs: MaintenanceLog[];
  /** Breakdowns still open - one per machine currently flagged DOWN. */
  open: MaintenanceLog[];
  bearings: BearingLog[];
  due: BearingDue[];
  loading: boolean;
  error: string | null;
}

const initialState: MaintenanceState = {
  logs: [],
  open: [],
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

/** The DOWN flags the Machines tab paints red. */
export const fetchOpenBreakdowns = createAsyncThunk(
  'maintenance/open',
  async (_, { rejectWithValue }) => {
    try {
      return (await maintenanceService.listOpen()).rows;
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

export const fetchBearingLogs = createAsyncThunk(
  'maintenance/bearingLogs',
  async (params: { machineId?: string; limit?: number } | undefined, { rejectWithValue }) => {
    try {
      return (await maintenanceService.bearings({ limit: 100, ...params })).rows;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const markDown = createAsyncThunk(
  'maintenance/markDown',
  async (payload: MarkDownPayload, { rejectWithValue }) => {
    try {
      return await maintenanceService.markDown(payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const logRepair = createAsyncThunk(
  'maintenance/repair',
  async ({ id, ...payload }: RepairPayload & { id: string }, { rejectWithValue }) => {
    try {
      return await maintenanceService.resolve(id, payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/** Withdraws a breakdown that was reported by mistake. */
export const cancelDown = createAsyncThunk(
  'maintenance/cancelDown',
  async (id: string, { rejectWithValue }) => {
    try {
      await maintenanceService.cancel(id);
      return id;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const logBearings = createAsyncThunk(
  'maintenance/logBearings',
  async (payload: BearingReadingPayload, { rejectWithValue, dispatch }) => {
    try {
      const logs = await maintenanceService.logBearings(payload);
      void dispatch(fetchBearingsDue());
      return logs;
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
      .addCase(fetchOpenBreakdowns.fulfilled, (state, action) => {
        state.open = action.payload;
      })
      .addCase(fetchBearingsDue.fulfilled, (state, action) => {
        state.due = action.payload;
      })
      .addCase(fetchBearingLogs.fulfilled, (state, action) => {
        state.bearings = action.payload;
      })
      .addCase(markDown.fulfilled, (state, action) => {
        state.open.unshift(action.payload);
        state.logs.unshift(action.payload);
      })
      .addCase(logRepair.fulfilled, (state, action) => {
        state.open = state.open.filter((l) => l.id !== action.payload.id);
        state.logs = state.logs.map((l) => (l.id === action.payload.id ? action.payload : l));
      })
      .addCase(cancelDown.fulfilled, (state, action) => {
        state.open = state.open.filter((l) => l.id !== action.payload);
        state.logs = state.logs.filter((l) => l.id !== action.payload);
      })
      .addCase(logBearings.fulfilled, (state, action) => {
        state.bearings = [...action.payload, ...state.bearings];
      });
  },
});

export default maintenanceSlice.reducer;
