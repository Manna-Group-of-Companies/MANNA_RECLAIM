import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { rateService } from '@/api/services/rate.service';
import { toRequestError } from '@/api/axiosClient';
import { PRICE_LIST } from '@/config/constants';
import type { CostRates, Rate } from '@/types/models';

interface RatesState {
  rates: Rate[];
  customers: string[];
  priceList: Record<string, number>;
  /** The plant's cost inputs - what the back office's Rates tab edits. */
  costRates: CostRates | null;
  saving: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: RatesState = {
  rates: [],
  customers: [],
  priceList: PRICE_LIST,
  costRates: null,
  saving: false,
  loading: false,
  error: null,
};

export const fetchRateCard = createAsyncThunk('rates/fetch', async (_, { rejectWithValue }) => {
  try {
    const [rates, customers, priceList] = await Promise.all([
      rateService.list({ limit: 500 }),
      rateService.customers({ limit: 500 }),
      rateService.priceList(),
    ]);
    return { rates: rates.rows, customers: customers.rows.map((c) => c.name), priceList };
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const saveRate = createAsyncThunk('rates/save', async (payload: Rate, { rejectWithValue }) => {
  try {
    return await rateService.save(payload);
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const fetchCostRates = createAsyncThunk('rates/costRates', async (_, { rejectWithValue }) => {
  try {
    return await rateService.costRates();
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const saveCostRates = createAsyncThunk(
  'rates/saveCostRates',
  async (data: Record<string, number | null>, { rejectWithValue }) => {
    try {
      return await rateService.saveCostRates(data);
    } catch (err) {
      return rejectWithValue(toRequestError(err).message);
    }
  },
);

const ratesSlice = createSlice({
  name: 'rates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRateCard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRateCard.fulfilled, (state, action) => {
        state.loading = false;
        state.rates = action.payload.rates;
        state.customers = action.payload.customers;
        state.priceList = action.payload.priceList;
      })
      .addCase(fetchRateCard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchCostRates.fulfilled, (state, action) => {
        state.costRates = action.payload;
      })
      .addCase(saveCostRates.pending, (state) => {
        state.saving = true;
      })
      .addCase(saveCostRates.fulfilled, (state, action) => {
        state.saving = false;
        state.costRates = action.payload;
      })
      .addCase(saveCostRates.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      })
      .addCase(saveRate.fulfilled, (state, action) => {
        const i = state.rates.findIndex(
          (r) => r.customer === action.payload.customer && r.grade === action.payload.grade,
        );
        if (i >= 0) state.rates[i] = action.payload;
        else state.rates.push(action.payload);
      });
  },
});

export default ratesSlice.reducer;
