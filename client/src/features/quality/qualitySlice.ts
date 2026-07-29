import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { qualityService, type RecordTestPayload } from '@/api/services/quality.service';
import { batchService } from '@/api/services/batch.service';
import { toRequestError } from '@/api/axiosClient';
import type { Batch, QualityGradeSummary, QualityTest } from '@/types/models';

interface QualityState {
  tests: QualityTest[];
  /** Open batches with no verdict yet - what the Quality tab works through. */
  pending: Batch[];
  summary: QualityGradeSummary[];
  /** Batch numbers the lab has put on hold. Dispatch warns about these. */
  held: string[];
  loading: boolean;
  error: string | null;
}

const initialState: QualityState = {
  tests: [],
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
 * against the tests on record and keeps the ones nobody has filed a verdict
 * for. Doing it here rather than per-component means the tab badge and the
 * page always agree.
 */
export const fetchPendingQuality = createAsyncThunk(
  'quality/pending',
  async (_, { rejectWithValue }) => {
    try {
      const [{ rows: batches }, { rows: tests }] = await Promise.all([
        batchService.listOpen({ limit: 100 }),
        qualityService.list({ limit: 200 }),
      ]);
      const tested = new Set(tests.map((t) => String(t.batch_no ?? t.batch_id ?? '')));
      const held = tests.filter((t) => t.verdict === 'hold').map((t) => String(t.batch_no ?? ''));
      return {
        pending: batches.filter((b) => !tested.has(String(b.ref))),
        tests,
        held: [...new Set(held.filter(Boolean))],
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
      });
  },
});

export default qualitySlice.reducer;
