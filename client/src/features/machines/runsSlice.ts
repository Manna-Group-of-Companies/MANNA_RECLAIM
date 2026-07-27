import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { runService, type StartRunPayload, type StopRunPayload } from '@/api/services/run.service';
import { toRequestError } from '@/api/axiosClient';
import type { Run } from '@/types/models';

interface RunsState {
  active: Run[];
  shift: Run[];
  loading: boolean;
  error: string | null;
  /** Runs recorded while offline, replayed by the sync hook. */
  queue: Partial<Run>[];
}

const initialState: RunsState = { active: [], shift: [], loading: false, error: null, queue: [] };

const fail = (err: unknown) => toRequestError(err).message;

export const fetchActiveRuns = createAsyncThunk('runs/active', async (_, { rejectWithValue }) => {
  try {
    return (await runService.listActive()).rows;
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const fetchShiftRuns = createAsyncThunk(
  'runs/shift',
  async (params: { date?: string; shift?: string } | undefined, { rejectWithValue }) => {
    try {
      return (await runService.byShift(params)).rows;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const startRun = createAsyncThunk(
  'runs/start',
  async (payload: StartRunPayload, { rejectWithValue }) => {
    try {
      return await runService.start(payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const stopRun = createAsyncThunk(
  'runs/stop',
  async ({ id, ...payload }: StopRunPayload & { id: string }, { rejectWithValue }) => {
    try {
      return await runService.stop(id, payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const flushQueue = createAsyncThunk('runs/flush', async (_, { getState }) => {
  const { runs } = getState() as { runs: RunsState };
  if (!runs.queue.length) return [];
  return runService.sync(runs.queue);
});

const runsSlice = createSlice({
  name: 'runs',
  initialState,
  reducers: {
    enqueue: (state, action: { payload: Partial<Run> }) => {
      state.queue.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchActiveRuns.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchActiveRuns.fulfilled, (state, action) => {
        state.loading = false;
        state.active = action.payload;
      })
      .addCase(fetchActiveRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchShiftRuns.fulfilled, (state, action) => {
        state.shift = action.payload;
      })
      .addCase(startRun.fulfilled, (state, action) => {
        state.active.push(action.payload);
      })
      .addCase(stopRun.fulfilled, (state, action) => {
        state.active = state.active.filter((r) => r.id !== action.payload.id);
        state.shift = [action.payload, ...state.shift];
      })
      .addCase(flushQueue.fulfilled, (state) => {
        state.queue = [];
      });
  },
});

export const { enqueue } = runsSlice.actions;
export default runsSlice.reducer;
