import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  runService,
  type PackRunPayload,
  type StartRunPayload,
  type StopRunPayload,
} from '@/api/services/run.service';
import { toRequestError } from '@/api/axiosClient';
import { SACK_KG, WEIGHED_PAGE } from '@/config/constants';
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
  pendingPack: Run[];
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
  pendingPack: [],
  packed: [],
  shift: [],
  shiftDate: null,
  shiftName: null,
  loading: false,
  error: null,
  queue: [],
};

const fail = (err: unknown) => toRequestError(err).message;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A freshly packed run as the stock list holds it. The pack answer carries the
 * sacks but not what has left against them, so whatever the list already knew
 * about this run stands until /runs/packed is read again.
 */
const asStock = (run: Run, known?: Run): Run => {
  const gone = known?.dispatched_sacks ?? 0;
  const avail = (run.packed_sacks ?? 0) - gone;
  return { ...run, dispatched_sacks: gone, avail_sacks: avail, avail_kg: round2(avail * SACK_KG) };
};

/**
 * Same rule as the server: a run is done packing when there is nothing left on
 * it worth filing.
 *
 * On a bagged run that means under one sack of material left, because the
 * remainder is carried into the next batch of the same grade rather than
 * bagged. On a press run it means every piece it moulded has been boxed - there
 * is no weight to divide and no remainder to carry, so the comparison is
 * between two counts.
 */
const stillPacking = (run: Run) => {
  if (run.kind === 'press') return (run.pieces ?? 0) > (run.packed_pieces ?? 0);
  const total = (run.weight_kg ?? run.out_weight ?? 0) + (run.leftout_in ?? 0);
  const packed = (run.packed_sacks ?? 0) * SACK_KG;
  return run.packed_sacks == null || total - packed >= SACK_KG;
};

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

export const fetchPendingPack = createAsyncThunk('runs/pendingPack', async (_, { rejectWithValue }) => {
  try {
    return (await runService.listPendingPack({ limit: 100 })).rows;
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

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

export const packRun = createAsyncThunk(
  'runs/pack',
  async ({ id, ...payload }: PackRunPayload & { id: string }, { rejectWithValue }) => {
    try {
      return await runService.pack(id, payload);
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
      .addCase(fetchPendingPack.fulfilled, (state, action) => {
        state.pendingPack = action.payload;
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
        // Weighing is what makes a run packable, so it moves queue rather than
        // leaving the Packing tab a refresh behind. A correction to a run that
        // is already there replaces it - it must not be listed twice.
        const packing = state.pendingPack.some((r) => r.id === run.id);
        if (packing) {
          state.pendingPack = stillPacking(run)
            ? state.pendingPack.map((r) => (r.id === run.id ? run : r))
            : state.pendingPack.filter((r) => r.id !== run.id);
        } else if (stillPacking(run)) {
          state.pendingPack.unshift(run);
        }
        // Same for the weighed list this correction may have come from: a run
        // weighed for the first time joins it and lifts the count with it.
        if (state.weighed.some((r) => r.id === run.id)) {
          state.weighed = state.weighed.map((r) => (r.id === run.id ? run : r));
        } else {
          state.weighed.unshift(run);
          state.weighedTotal += 1;
        }
      })
      .addCase(packRun.fulfilled, (state, action) => {
        const run = action.payload;
        state.shift = state.shift.map((r) => (r.id === run.id ? run : r));
        state.pendingPack = stillPacking(run)
          ? state.pendingPack.map((r) => (r.id === run.id ? run : r))
          : state.pendingPack.filter((r) => r.id !== run.id);
        // Bagging is what puts stock in the yard, so the Stock tab has it
        // without waiting for a refetch. Sacks corrected back down to none -
        // or all of them already gone out - take the run off the list again.
        const known = state.packed.find((r) => r.id === run.id);
        const stock = asStock(run, known);
        state.packed = state.packed.filter((r) => r.id !== run.id);
        if ((stock.avail_sacks ?? 0) > 0) state.packed.unshift(stock);
      })
      .addCase(flushQueue.fulfilled, (state) => {
        state.queue = [];
      });
  },
});

export const { enqueue } = runsSlice.actions;
export default runsSlice.reducer;
