import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { productService } from '@/api/services/product.service';
import { toRequestError } from '@/api/axiosClient';
import type { Product } from '@/types/models';

/**
 * What the presses mould. Read on the Machines tab because a press cannot be
 * started without one: the start sheet offers the list, and says what to do when
 * it is empty rather than opening a form with nothing to pick.
 */
interface ProductsState {
  items: Product[];
  /** Whether the list has been read at all, so "empty" can be told from "not yet". */
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: ProductsState = {
  items: [],
  loaded: false,
  loading: false,
  error: null,
};

export const fetchProducts = createAsyncThunk('products/fetch', async (_, { rejectWithValue }) => {
  try {
    return (await productService.listActive()).rows;
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.items = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        // Not `loaded`: a list that could not be read is not an empty list, and
        // the press sheet must not tell the crew to go and add a product over a
        // dropped connection.
        state.error = action.payload as string;
      });
  },
});

export default productsSlice.reducer;
