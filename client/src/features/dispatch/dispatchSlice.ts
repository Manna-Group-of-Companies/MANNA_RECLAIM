import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { dispatchService } from '@/api/services/dispatch.service';
import { toRequestError } from '@/api/axiosClient';
import type { Dispatch, DispatchLoad } from '@/types/models';

interface DispatchState {
  items: Dispatch[];
  current: Dispatch | null;
  loading: boolean;
  error: string | null;
}

const initialState: DispatchState = { items: [], current: null, loading: false, error: null };

export const fetchDispatches = createAsyncThunk(
  'dispatch/fetch',
  async (params: { customer?: string; status?: string } | undefined, { rejectWithValue }) => {
    try {
      return (await dispatchService.list(params)).rows;
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

export const fetchDispatch = createAsyncThunk('dispatch/one', async (id: string, { rejectWithValue }) => {
  try {
    return await dispatchService.getOne(id);
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const createDispatch = createAsyncThunk(
  'dispatch/create',
  async (payload: Partial<Dispatch>, { rejectWithValue }) => {
    try {
      return await dispatchService.create(payload);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

export const addLoad = createAsyncThunk(
  'dispatch/addLoad',
  async ({ id, load }: { id: string; load: Partial<DispatchLoad> }, { rejectWithValue }) => {
    try {
      return await dispatchService.addLoad(id, load);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

const dispatchSlice = createSlice({
  name: 'dispatch',
  initialState,
  reducers: {
    clearCurrent: (state) => {
      state.current = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDispatches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDispatches.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchDispatches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchDispatch.fulfilled, (state, action) => {
        state.current = action.payload;
      })
      .addCase(createDispatch.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.current = action.payload;
      })
      .addCase(addLoad.fulfilled, (state, action) => {
        if (state.current) state.current.loads = [...(state.current.loads ?? []), action.payload];
      });
  },
});

export const { clearCurrent } = dispatchSlice.actions;
export default dispatchSlice.reducer;
