import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authService, type LoginPayload } from '@/api/services/auth.service';
import { toRequestError, tokenStore } from '@/api/axiosClient';
import { storageKeys } from '@/config/env';
import { ADMIN_ROLES } from '@/config/constants';
import type { User } from '@/types/models';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
}

const cached = (): User | null => {
  try {
    const raw = localStorage.getItem(storageKeys.user);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const initialState: AuthState = {
  user: cached(),
  status: tokenStore.get() ? 'authenticated' : 'idle',
  error: null,
};

export const login = createAsyncThunk('auth/login', async (payload: LoginPayload, { rejectWithValue }) => {
  try {
    return await authService.login(payload);
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const loadSession = createAsyncThunk('auth/loadSession', async (_, { rejectWithValue }) => {
  try {
    return await authService.me();
  } catch (err) {
    return rejectWithValue(toRequestError(err).message);
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await authService.logout();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    /** Fired by the axios interceptor when a refresh fails. */
    sessionExpired: (state) => {
      state.user = null;
      state.status = 'idle';
      localStorage.removeItem(storageKeys.user);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
        localStorage.setItem(storageKeys.user, JSON.stringify(action.payload.user));
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'error';
        state.error = (action.payload as string) ?? 'Sign in failed';
      })
      .addCase(loadSession.fulfilled, (state, action: PayloadAction<User>) => {
        state.status = 'authenticated';
        state.user = action.payload;
        localStorage.setItem(storageKeys.user, JSON.stringify(action.payload));
      })
      .addCase(loadSession.rejected, (state) => {
        state.status = 'idle';
        state.user = null;
        localStorage.removeItem(storageKeys.user);
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'idle';
        state.user = null;
        state.error = null;
        localStorage.removeItem(storageKeys.user);
      });
  },
});

export const { clearError, sessionExpired } = authSlice.actions;

export const selectUser = (s: { auth: AuthState }) => s.auth.user;
export const selectIsAuthed = (s: { auth: AuthState }) => s.auth.status === 'authenticated';
export const selectIsAdmin = (s: { auth: AuthState }) =>
  Boolean(s.auth.user && ADMIN_ROLES.includes(s.auth.user.role));

export default authSlice.reducer;
