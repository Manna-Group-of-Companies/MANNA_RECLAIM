import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { batchService } from '@/api/services/batch.service';
import { toRequestError } from '@/api/axiosClient';
import type { Batch } from '@/types/models';
import type { PageMeta } from '@/types/api';

interface BatchesState {
  items: Batch[];
  meta: PageMeta | null;
  loading: boolean;
  error: string | null;
}

const initialState: BatchesState = { items: [], meta: null, loading: false, error: null };

export const fetchOpenBatches = createAsyncThunk('batches/fetchOpen', async (_, { rejectWithValue }) => {
  try {
    return await batchService.listOpen({ limit: 100 });
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

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

const batchesSlice = createSlice({
  name: 'batches',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
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
      .addCase(createBatch.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(closeBatch.fulfilled, (state, action) => {
        state.items = state.items.filter((b) => b.id !== action.payload.id);
      });
  },
});

export default batchesSlice.reducer;
