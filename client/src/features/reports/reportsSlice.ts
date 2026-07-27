import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { reportService, type DateRange } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import type { CostingReport, EfficiencyRow, ProductionReport } from '@/types/models';

interface ReportsState {
  range: DateRange;
  production: ProductionReport | null;
  efficiency: EfficiencyRow[];
  costing: CostingReport | null;
  loading: boolean;
  error: string | null;
}

const initialState: ReportsState = {
  range: {},
  production: null,
  efficiency: [],
  costing: null,
  loading: false,
  error: null,
};

/** The user Reports tab needs production only; the admin dashboard needs all three. */
export const fetchProduction = createAsyncThunk(
  'reports/production',
  async (range: DateRange | undefined, { rejectWithValue }) => {
    try {
      return await reportService.production(range);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

export const fetchDashboard = createAsyncThunk(
  'reports/dashboard',
  async (range: DateRange | undefined, { rejectWithValue }) => {
    try {
      return await reportService.dashboard(range);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
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
      });
  },
});

export const { setRange } = reportsSlice.actions;
export default reportsSlice.reducer;
