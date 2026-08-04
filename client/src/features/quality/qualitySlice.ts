import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  qualityService,
  type RecordTestPayload,
  type ReportPayload,
} from '@/api/services/quality.service';
import { batchService } from '@/api/services/batch.service';
import { toRequestError } from '@/api/axiosClient';
import { requestRefresh } from '@/features/ui/uiSlice';
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
      /*
       * Filing a verdict moves the yard as well as the lab's own record.
       * Passing a batch releases its stock group, and a passing sample lifts a
       * pool left at pending - so a Stock view open beside this one is stale
       * the moment this returns, showing "awaiting the lab" for stock the lab
       * has just cleared.
       *
       * Bumped here rather than in the screen because the write is what makes
       * it stale, and both the batch sheet and the pool sample sheet go through
       * this thunk. Any page watching refreshTick re-reads itself.
       */
      void dispatch(requestRefresh());
      return test;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/** The lab's report, uploaded once the verdict it belongs to is on file. */
export const attachReport = createAsyncThunk(
  'quality/report',
  async (payload: ReportPayload, { rejectWithValue, dispatch }) => {
    try {
      const test = await qualityService.attachReport(payload);
      /*
       * The yard shows the sheet the verdict was made on, not only the verdict
       * - the readings, the tester and the report link travel with the goods on
       * the stock card. So the report landing is a change to what that card
       * says, and it happens after recordTest has already bumped the tick: the
       * upload is a second call made once the test is filed, so the refresh it
       * triggered went out while this file was still going up. Without this the
       * card carries the verdict with no report against it until the yard's
       * thirty-second poll comes round.
       */
      void dispatch(requestRefresh());
      return test;
    } catch (err) {
      return rejectWithValue(fail(err));
    }
  },
);

/**
 * Takes a test off the record - the back office's, and the only lab edit that
 * is not a re-test.
 *
 * The bench corrects itself by filing again, because tests are append-only and
 * the newest verdict standing is the one the yard reads. What that cannot fix
 * is a test filed against the wrong batch or the wrong grade: it goes on
 * releasing goods it was never about, and every re-test lands on a different
 * key. Deleting it is what puts those goods back.
 *
 * The refresh is the point as much as the delete. The verdict is kept on the
 * stock group as well as on the test - a dispatch reads it there - so removing
 * the row moves the yard, and a Stock view open beside this one would otherwise
 * go on showing a released pallet with nothing behind it.
 */
export const removeTest = createAsyncThunk(
  'quality/remove',
  async (id: string, { rejectWithValue, dispatch }) => {
    try {
      const removed = await qualityService.remove(id);
      void dispatch(fetchPendingQuality());
      void dispatch(requestRefresh());
      return removed;
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
      })
      /*
       * Out of the list immediately, so the row does not sit there looking
       * deleted-but-not. `held` and the per-batch state are left to
       * fetchPendingQuality(), which the thunk dispatches: which grades are
       * still awaiting a verdict and which batches are held is worked out from
       * the whole set of tests, and dropping one row is not something that can
       * be applied to those answers a field at a time.
       */
      .addCase(removeTest.fulfilled, (state, action) => {
        state.tests = state.tests.filter((t) => t.id !== action.payload.id);
      });
  },
});

export default qualitySlice.reducer;
