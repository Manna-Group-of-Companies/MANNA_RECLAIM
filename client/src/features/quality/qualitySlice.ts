import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  qualityService,
  type RecordTestPayload,
  type ReportPayload,
} from '@/api/services/quality.service';
import { batchService } from '@/api/services/batch.service';
import { toRequestError } from '@/api/axiosClient';
import { batchQc } from './qc';
import type { Batch, QualityGradeSummary, QualityTest } from '@/types/models';

interface QualityState {
  tests: QualityTest[];
  /** Every open batch, tested or not - the Quality tab lists them all. */
  batches: Batch[];
  /** Those with a grade still awaiting a verdict - the tab's badge counts these. */
  pending: Batch[];
  summary: QualityGradeSummary[];
  /** Batch numbers the lab has put on hold. Dispatch warns about these. */
  held: string[];
  loading: boolean;
  error: string | null;
}

const initialState: QualityState = {
  tests: [],
  batches: [],
  pending: [],
  summary: [],
  held: [],
  loading: false,
  error: null,
};

const fail = (err: unknown) => toRequestError(err).message;

export const fetchQualityTests = createAsyncThunk(
  'quality/fetch',
  async (params: { batchNo?: string } | undefined, { rejectWithValue }) => {
    try {
      return (await qualityService.list({ limit: 100, ...params })).rows;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/**
 * Which open batches still need the lab.
 *
 * There is no "untested batches" endpoint, so this pairs the open batches
 * against the tests on record and works out where each grade stands. A batch is
 * pending while any one of its grades is untested, and held once the verdict
 * that stands for any grade is a hold. Doing it here rather than per-component
 * means the tab badge, the page and Dispatch's warning always agree.
 */
export const fetchPendingQuality = createAsyncThunk(
  'quality/pending',
  async (_, { rejectWithValue }) => {
    try {
      const [{ rows: batches }, { rows: tests }] = await Promise.all([
        batchService.listOpen({ limit: 100 }),
        qualityService.list({ limit: 200 }),
      ]);
      const state = batches.map((batch) => ({ batch, qc: batchQc(batch, tests) }));
      return {
        batches,
        tests,
        pending: state.filter(({ qc }) => !qc.allDone).map(({ batch }) => batch),
        held: state.filter(({ qc }) => qc.anyHold).map(({ batch }) => String(batch.ref)),
      };
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const fetchQualitySummary = createAsyncThunk(
  'quality/summary',
  async (params: { from?: string; to?: string } | undefined, { rejectWithValue }) => {
    try {
      return await qualityService.summary(params);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

export const recordTest = createAsyncThunk(
  'quality/record',
  async (payload: RecordTestPayload, { rejectWithValue, dispatch }) => {
    try {
      const test = await qualityService.record(payload);
      void dispatch(fetchPendingQuality());
      return test;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/** The lab's report, uploaded once the verdict it belongs to is on file. */
export const attachReport = createAsyncThunk(
  'quality/report',
  async (payload: ReportPayload, { rejectWithValue }) => {
    try {
      return await qualityService.attachReport(payload);
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

const qualitySlice = createSlice({
  name: 'quality',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQualityTests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQualityTests.fulfilled, (state, action) => {
        state.loading = false;
        state.tests = action.payload;
      })
      .addCase(fetchQualityTests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchPendingQuality.fulfilled, (state, action) => {
        state.batches = action.payload.batches;
        state.pending = action.payload.pending;
        state.tests = action.payload.tests;
        state.held = action.payload.held;
      })
      .addCase(fetchQualitySummary.fulfilled, (state, action) => {
        state.summary = action.payload;
      })
      .addCase(recordTest.fulfilled, (state, action) => {
        state.tests.unshift(action.payload);
        if (action.payload.verdict === 'hold' && action.payload.batch_no) {
          state.held = [...new Set([...state.held, action.payload.batch_no])];
        }
      })
      .addCase(attachReport.fulfilled, (state, action) => {
        const at = state.tests.findIndex((t) => t.id === action.payload.id);
        if (at >= 0) state.tests[at] = action.payload;
      });
  },
});

export default qualitySlice.reducer;
