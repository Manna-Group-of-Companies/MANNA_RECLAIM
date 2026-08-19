import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { batchService } from '@/api/services/batch.service';
import { toRequestError } from '@/api/axiosClient';
import type { Batch, BatchDetail, Quality } from '@/types/models';
import type { PageMeta } from '@/types/api';

interface BatchesState {
  items: Batch[];
  meta: PageMeta | null;
  loading: boolean;
  error: string | null;
  /** The batch whose detail view is open, and whether it is still arriving. */
  detail: BatchDetail | null;
  detailLoading: boolean;
}

const initialState: BatchesState = {
  items: [],
  meta: null,
  loading: false,
  error: null,
  detail: null,
  detailLoading: false,
};

/**
 * The server's page size, and the most it will hand over at once - it clamps
 * anything larger.
 */
const OPEN_PAGE = 200;

/**
 * Every open batch, however many pages that takes.
 *
 * It used to ask for one page of 100 and keep whatever came back. The open list
 * is sorted oldest first - the order they need attention in - so the hundredth
 * batch was a cutoff, and everything charged after it was simply not on the
 * floor's screen. At 102 open batches that silently cost the refiner picker the
 * two newest numbers on the plant, which are the two most likely to be the one
 * the crew is standing in front of. A picker that quietly leaves a batch out is
 * worse than a slow one: the grid reads as "these are all the batches there
 * are", so the crew goes looking for a charge nobody can find.
 *
 * So it reads until it has the total the first page reported. The count is
 * bounded by what is genuinely open, and in practice that is one request.
 */
export const fetchOpenBatches = createAsyncThunk('batches/fetchOpen', async (_, { rejectWithValue }) => {
  try {
    const first = await batchService.listOpen({ page: 1, limit: OPEN_PAGE });
    const rows = [...first.rows];
    const pages = first.meta?.pages ?? 1;
    for (let page = 2; page <= pages; page += 1) {
      const next = await batchService.listOpen({ page, limit: OPEN_PAGE });
      // An empty page means the list moved under us - stop rather than spin.
      if (!next.rows.length) break;
      rows.push(...next.rows);
    }
    return { rows, meta: first.meta };
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const fetchBatchDetail = createAsyncThunk(
  'batches/fetchDetail',
  async (id: string, { rejectWithValue }) => {
    try {
      return await batchService.getOne(id);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

export const createBatch = createAsyncThunk(
  'batches/create',
  async (payload: Partial<Batch>, { rejectWithValue }) => {
    try {
      return await batchService.create(payload);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

/**
 * Ticking a grade the batch will yield, or taking one back off.
 *
 * The server has the last word on both - it refuses a batch still in the
 * autoclave, and refuses to untick a grade a refiner has already run - so its
 * message is what comes back for the card to show.
 */
export const setBatchQuality = createAsyncThunk(
  'batches/setQuality',
  async (
    { id, quality, marked }: { id: string; quality: Quality; marked: boolean },
    { rejectWithValue },
  ) => {
    try {
      return await batchService.setQuality(id, quality, marked);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

export const closeBatch = createAsyncThunk(
  'batches/close',
  async ({ id, remarks }: { id: string; remarks?: string }, { rejectWithValue }) => {
    try {
      return await batchService.close(id, remarks);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

/** Orphans only. Takes the batch's runs and quality tests with it. */
export const deleteBatch = createAsyncThunk(
  'batches/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      return await batchService.remove(id);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

const batchesSlice = createSlice({
  name: 'batches',
  initialState,
  reducers: {
    clearBatchDetail: (state) => {
      state.detail = null;
      state.detailLoading = false;
    },
  },
  extraReducers: (builder) => {
    /** A batch that came back changed replaces the one on the list in place. */
    const replace = (state: BatchesState, batch: Batch) => {
      const index = state.items.findIndex((b) => b.id === batch.id);
      if (index >= 0) state.items[index] = batch;
      if (state.detail?.id === batch.id) state.detail = { ...state.detail, ...batch };
    };

    builder
      .addCase(fetchOpenBatches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOpenBatches.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.rows;
        state.meta = action.payload.meta ?? null;
      })
      .addCase(fetchOpenBatches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchBatchDetail.pending, (state) => {
        state.detailLoading = true;
      })
      .addCase(fetchBatchDetail.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.detail = action.payload;
      })
      .addCase(fetchBatchDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload as string;
      })
      .addCase(createBatch.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(setBatchQuality.fulfilled, (state, action) => {
        replace(state, action.payload);
      })
      // Closing files the batch away: it drops off this list and every refiner
      // picker that reads it, and stays on the record for dispatch and history.
      .addCase(closeBatch.fulfilled, (state, action) => {
        state.items = state.items.filter((b) => b.id !== action.payload.id);
        if (state.detail?.id === action.payload.id) state.detail = null;
      })
      .addCase(deleteBatch.fulfilled, (state, action) => {
        state.items = state.items.filter((b) => b.id !== action.payload.id);
        if (state.detail?.id === action.payload.id) state.detail = null;
      });
  },
});

export const { clearBatchDetail } = batchesSlice.actions;
export default batchesSlice.reducer;
