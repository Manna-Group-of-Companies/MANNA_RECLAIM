import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { machineService } from '@/api/services/machine.service';
import { toRequestError } from '@/api/axiosClient';
import type { Machine } from '@/types/models';

interface MachinesState {
  items: Machine[];
  groups: Record<string, Machine[]>;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: MachinesState = {
  items: [],
  groups: {},
  selectedId: null,
  loading: false,
  error: null,
};

export const fetchMachines = createAsyncThunk('machines/fetch', async (_, { rejectWithValue }) => {
  try {
    return await machineService.grouped();
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const toggleMachine = createAsyncThunk(
  'machines/toggle',
  async ({ id, enabled }: { id: string; enabled: boolean }, { rejectWithValue }) => {
    try {
      return await machineService.setEnabled(id, enabled);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

const machinesSlice = createSlice({
  name: 'machines',
  initialState,
  reducers: {
    selectMachine: (state, action: { payload: string | null }) => {
      state.selectedId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMachines.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMachines.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.rows;
        state.groups = action.payload.groups;
      })
      .addCase(fetchMachines.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(toggleMachine.fulfilled, (state, action) => {
        state.items = state.items.map((m) => (m.id === action.payload.id ? action.payload : m));
      });
  },
});

export const { selectMachine } = machinesSlice.actions;
export default machinesSlice.reducer;
