import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  reportService,
  type DateRange,
  type EfficiencyNotePayload,
  type VarianceReasonPayload,
} from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import type {
  CostingReport,
  DowntimeDetail,
  DowntimeReport,
  EfficiencyRow,
  ProductionReport,
  RunFilters,
  ShiftEfficiency,
  ShiftOption,
  VarianceReason,
} from '@/types/models';

interface ReportsState {
  range: DateRange;
  production: ProductionReport | null;
  efficiency: EfficiencyRow[];
  costing: CostingReport | null;
  /** Days / shifts / machines the history covers, for the pickers. */
  filters: RunFilters | null;
  shifts: ShiftOption[];
  shiftEfficiency: ShiftEfficiency | null;
  /** Every reason recorded over the window on the picker - the month's review. */
  varianceReasons: VarianceReason[];
  downtime: DowntimeReport | null;
  downtimeDetail: DowntimeDetail[];
  loading: boolean;
  error: string | null;
}

const initialState: ReportsState = {
  range: {},
  production: null,
  efficiency: [],
  costing: null,
  filters: null,
  shifts: [],
  shiftEfficiency: null,
  varianceReasons: [],
  downtime: null,
  downtimeDetail: [],
  loading: false,
  error: null,
};

const fail = (err: unknown) => toRequestError(err).message;

/** The user Reports tab needs production only; the admin dashboard needs all three. */
export const fetchProduction = createAsyncThunk(
  'reports/production',
  async (range: DateRange | undefined, { rejectWithValue }) => {
    try {
      return await reportService.production(range);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchDashboard = createAsyncThunk(
  'reports/dashboard',
  async (range: DateRange | undefined, { rejectWithValue }) => {
    try {
      return await reportService.dashboard(range);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchRunFilters = createAsyncThunk('reports/filters', async (_, { rejectWithValue }) => {
  try {
    return await reportService.filters();
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const fetchShiftOptions = createAsyncThunk('reports/shifts', async (_, { rejectWithValue }) => {
  try {
    return await reportService.shifts();
  } catch (err) {
    return rejectWithValue(fail(err));
  }
});

export const fetchShiftEfficiency = createAsyncThunk(
  'reports/shiftEfficiency',
  async (params: { date: string; shift: string }, { rejectWithValue }) => {
    try {
      return await reportService.shiftEfficiency(params);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const addEfficiencyNote = createAsyncThunk(
  'reports/addNote',
  async (payload: EfficiencyNotePayload, { rejectWithValue }) => {
    try {
      return await reportService.addEfficiencyNote(payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/** Why an actual missed the manager's ideal - a different record to the above. */
export const addVarianceReason = createAsyncThunk(
  'reports/addVarianceReason',
  async (payload: VarianceReasonPayload, { rejectWithValue }) => {
    try {
      return await reportService.addVarianceReason(payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/** The month's reasons, for review rather than for one shift's cards. */
export const fetchVarianceReasons = createAsyncThunk(
  'reports/varianceReasons',
  async (range: DateRange | undefined, { rejectWithValue }) => {
    try {
      return await reportService.varianceReasons(range);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const updateVarianceReason = createAsyncThunk(
  'reports/updateVarianceReason',
  async (
    { id, reason, enteredBy }: { id: string; reason: string; enteredBy?: string | null },
    { rejectWithValue },
  ) => {
    try {
      return await reportService.updateVarianceReason(id, { reason, enteredBy });
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchDowntime = createAsyncThunk(
  'reports/downtime',
  async (params: { month?: string } | undefined, { rejectWithValue }) => {
    try {
      return await reportService.downtime(params);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchDowntimeDetail = createAsyncThunk(
  'reports/downtimeDetail',
  async (params: { month?: string; machineId: string }, { rejectWithValue }) => {
    try {
      return await reportService.downtimeDetail(params);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    setRange: (state, action: { payload: DateRange }) => {
      state.range = action.payload;
    },
    clearDowntimeDetail: (state) => {
      state.downtimeDetail = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProduction.fulfilled, (state, action) => {
        state.production = action.payload;
      })
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.production = action.payload.production;
        state.efficiency = action.payload.efficiency;
        state.costing = action.payload.costing;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchRunFilters.fulfilled, (state, action) => {
        state.filters = action.payload;
      })
      .addCase(fetchShiftOptions.fulfilled, (state, action) => {
        state.shifts = action.payload;
      })
      .addCase(fetchShiftEfficiency.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchShiftEfficiency.fulfilled, (state, action) => {
        state.loading = false;
        state.shiftEfficiency = action.payload;
      })
      .addCase(fetchShiftEfficiency.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(addEfficiencyNote.fulfilled, (state, action) => {
        if (state.shiftEfficiency) {
          state.shiftEfficiency.notes = [action.payload, ...state.shiftEfficiency.notes];
        }
      })
      .addCase(addVarianceReason.fulfilled, (state, action) => {
        if (state.shiftEfficiency) {
          state.shiftEfficiency.varianceReasons = [
            action.payload,
            ...(state.shiftEfficiency.varianceReasons ?? []),
          ];
        }
        state.varianceReasons = [action.payload, ...state.varianceReasons];
      })
      .addCase(fetchVarianceReasons.fulfilled, (state, action) => {
        state.varianceReasons = action.payload;
      })
      // The same row is on the shift's cards and in the month's review, so a
      // correction has to land in both or the screen shows the old wording
      // beside the new one.
      .addCase(updateVarianceReason.fulfilled, (state, action) => {
        const replace = (rows: VarianceReason[]) =>
          rows.map((r) => (r.id === action.payload.id ? action.payload : r));
        state.varianceReasons = replace(state.varianceReasons);
        if (state.shiftEfficiency?.varianceReasons) {
          state.shiftEfficiency.varianceReasons = replace(state.shiftEfficiency.varianceReasons);
        }
      })
      .addCase(fetchDowntime.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDowntime.fulfilled, (state, action) => {
        state.loading = false;
        state.downtime = action.payload;
      })
      .addCase(fetchDowntime.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchDowntimeDetail.fulfilled, (state, action) => {
        state.downtimeDetail = action.payload;
      });
  },
});

export const { setRange, clearDowntimeDetail } = reportsSlice.actions;
export default reportsSlice.reducer;
