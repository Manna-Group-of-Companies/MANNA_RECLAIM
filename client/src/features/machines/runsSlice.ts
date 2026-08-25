import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  runService,

  type StartRunPayload,
  type StopRunPayload,
} from '@/api/services/run.service';
import { toRequestError } from '@/api/axiosClient';
import { requestRefresh } from '@/features/ui/uiSlice';
import { WEIGHED_PAGE } from '@/config/constants';
import type { Run, Shift } from '@/types/models';

interface RunsState {
  active: Run[];
  /** Finished runs on a weighed machine that still owe an out-weight. */
  pendingWeigh: Run[];
  /** Runs already weighed, newest first - the Weigh tab's correction list. */
  weighed: Run[];
  /** How many there are altogether, so the tab can say "latest 20 of 414". */
  weighedTotal: number;
  /** Whether `weighed` holds the whole record or only the newest page of it. */
  weighedAll: boolean;
  /** Weighed runs that still have full sacks to bag. */

  /** Sacks already bagged and not yet dispatched - the Stock tab's stock. */
  packed: Run[];
  shift: Run[];
  /** Which shift `shift` actually holds - the server falls back to the
   *  latest one on record when the requested day has no runs. */
  shiftDate: string | null;
  shiftName: Shift | null;
  loading: boolean;
  error: string | null;
  /** Runs recorded while offline, replayed by the sync hook. */
  queue: Partial<Run>[];
}

const initialState: RunsState = {
  active: [],
  pendingWeigh: [],
  weighed: [],
  weighedTotal: 0,
  weighedAll: false,

  packed: [],
  shift: [],
  shiftDate: null,
  shiftName: null,
  loading: false,
  error: null,
  queue: [],
};

const fail = (err: unknown) => toRequestError(err).message;


export const fetchActiveRuns = createAsyncThunk('runs/active', async (_, { rejectWithValue }) => {
  try {
    return (await runService.listActive()).rows;
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const fetchPendingWeigh = createAsyncThunk(
  'runs/pendingWeigh',
  async (_, { rejectWithValue }) => {
    try {
      return (await runService.listPendingWeigh({ limit: 100 })).rows;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/**
 * The weighed runs behind the Weigh tab's correction list. `all` asks for the
 * plant's whole record rather than the newest page - what Show all sends.
 */
export const fetchWeighed = createAsyncThunk(
  'runs/weighed',
  async ({ all = false }: { all?: boolean } = {}, { rejectWithValue }) => {
    try {
      const { rows, meta } = await runService.listWeighed(
        all ? { all: true } : { limit: WEIGHED_PAGE },
      );
      return { rows, total: meta?.total ?? rows.length, all };
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);


/** The packed sacks the Stock tab loads a vehicle from. */
export const fetchPacked = createAsyncThunk('runs/packed', async (_, { rejectWithValue }) => {
  try {
    return (await runService.listPacked({ limit: 100 })).rows;
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const fetchShiftRuns = createAsyncThunk(
  'runs/shift',
  async (params: { date?: string; shift?: string } | undefined, { rejectWithValue }) => {
    try {
      const { rows, meta } = await runService.byShift({ ...params, limit: 200 });
      return {
        rows,
        shiftDate: meta?.shift_date ?? params?.date ?? null,
        shiftName: (meta?.shift ?? params?.shift ?? null) as Shift | null,
      };
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

export const cancelRun = createAsyncThunk(
  'runs/cancel',
  async (id: string, { rejectWithValue }) => {
    try {
      await runService.cancel(id);
      return id;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const pauseRun = createAsyncThunk(
  'runs/pause',
  async ({ id, paused }: { id: string; paused: boolean }, { rejectWithValue }) => {
    try {
      return await runService.pause(id, paused);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/**
 * Banks the running tally on a machine that is still going. The whole list is
 * sent, so this is both "add a load" and "take one off".
 */
export const tallyRun = createAsyncThunk(
  'runs/tally',
  async ({ id, entries }: { id: string; entries: number[] }, { rejectWithValue }) => {
    try {
      return await runService.tally(id, entries);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const weighRun = createAsyncThunk(
  'runs/weigh',
  async (
    { id, outWeight, entries }: { id: string; outWeight: number; entries?: number[] },
    { rejectWithValue },
  ) => {
    try {
      return await runService.weigh(id, outWeight, entries);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/**
 * Clears the weighing off a run, and tells the rest of the app the run moved.
 *
 * The refresh is here for the same reason it is on unpackRun: what this changes
 * is mostly not on the Weigh tab. A run with no weight is not packable, so it
 * comes off the yard's stock with it, and a Stock tab left open would otherwise
 * go on offering sacks that are no longer there.
 */
export const unweighRun = createAsyncThunk(
  'runs/unweigh',
  async (id: string, { rejectWithValue, dispatch }) => {
    try {
      const undone = await runService.unweigh(id);
      void dispatch(requestRefresh());
      return undone;
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
      .addCase(fetchPendingWeigh.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPendingWeigh.fulfilled, (state, action) => {
        state.loading = false;
        state.pendingWeigh = action.payload;
      })
      .addCase(fetchPendingWeigh.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchWeighed.fulfilled, (state, action) => {
        state.weighed = action.payload.rows;
        state.weighedTotal = action.payload.total;
        state.weighedAll = action.payload.all;
      })
      .addCase(fetchWeighed.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(fetchPacked.fulfilled, (state, action) => {
        state.packed = action.payload;
      })
      .addCase(fetchPacked.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(fetchShiftRuns.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchShiftRuns.fulfilled, (state, action) => {
        state.loading = false;
        state.shift = action.payload.rows;
        state.shiftDate = action.payload.shiftDate;
        state.shiftName = action.payload.shiftName;
      })
      .addCase(fetchShiftRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(startRun.fulfilled, (state, action) => {
        state.active.push(action.payload);
      })
      .addCase(cancelRun.fulfilled, (state, action) => {
        // The row is gone, so the machine goes straight back to idle.
        state.active = state.active.filter((r) => r.id !== action.payload);
      })
      .addCase(pauseRun.fulfilled, (state, action) => {
        state.active = state.active.map((r) => (r.id === action.payload.id ? action.payload : r));
      })
      .addCase(tallyRun.fulfilled, (state, action) => {
        state.active = state.active.map((r) => (r.id === action.payload.id ? action.payload : r));
      })
      .addCase(stopRun.fulfilled, (state, action) => {
        const run = action.payload;
        // A shiftwise stop can be folded into the record the shift already has,
        // in which case the row it was logged on is gone and what comes back is
        // the merged one under a different id - so both have to leave `active`,
        // and the shift list gets the merged row in place of its earlier self
        // rather than a second copy of the same shift.
        const gone = [run.id, run.merged_from].filter(Boolean) as string[];
        state.active = state.active.filter((r) => !gone.includes(r.id));
        state.shift = [run, ...state.shift.filter((r) => !gone.includes(r.id))];
        // A weighed machine drops straight onto the Weigh tab when it stops
        // without a weight - carrying whatever was tallied while it ran.
        state.pendingWeigh = state.pendingWeigh.filter((r) => !gone.includes(r.id));
        if (run.out_weight == null && (run.needs_weight || run.needs_weigh)) {
          state.pendingWeigh.unshift(run);
        }
      })
      .addCase(weighRun.fulfilled, (state, action) => {
        const run = action.payload;
        state.pendingWeigh = state.pendingWeigh.filter((r) => r.id !== run.id);
        state.shift = state.shift.map((r) => (r.id === run.id ? run : r));
        // The weighed list this correction may have come from: a run
        // weighed for the first time joins it and lifts the count with it.
        if (state.weighed.some((r) => r.id === run.id)) {
          state.weighed = state.weighed.map((r) => (r.id === run.id ? run : r));
        } else {
          state.weighed.unshift(run);
          state.weighedTotal += 1;
        }
      })
      /*
       * The mirror of weighRun above. A run with its weight cleared owes one
       * again, so it goes back on the queue the same call took it off.
       *
       * `needs_weight` is set here rather than read off the answer: the flag is
       * what listPendingWeigh() stamps on its own rows, and this run is being
       * put on that list by hand rather than fetched from it.
       */
      .addCase(unweighRun.fulfilled, (state, action) => {
        const run = action.payload.run;
        state.shift = state.shift.map((r) => (r.id === run.id ? run : r));
        if (state.weighed.some((r) => r.id === run.id)) {
          state.weighed = state.weighed.filter((r) => r.id !== run.id);
          state.weighedTotal = Math.max(0, state.weighedTotal - 1);
        }
        if (!state.pendingWeigh.some((r) => r.id === run.id)) {
          state.pendingWeigh.unshift({ ...run, needs_weight: true });
        }
      })

      .addCase(flushQueue.fulfilled, (state) => {
        state.queue = [];
      });
  },
});

export const { enqueue } = runsSlice.actions;
export default runsSlice.reducer;
