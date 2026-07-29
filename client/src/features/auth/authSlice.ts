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

/**
 * The signed-in user from the last visit.
 *
 * Only trusted when there is still an access token beside it. A cached user on
 * its own is not a session - and treating it as one is how the app used to end
 * up with `user` set but `status: 'idle'`, which makes a login page think it
 * should redirect to a guarded page while the guard thinks it should redirect
 * back. The stale copy is cleared here so that state cannot arise at all.
 */
const cached = (): User | null => {
  try {
    if (!tokenStore.get()) {
      localStorage.removeItem(storageKeys.user);
      return null;
    }
    const raw = localStorage.getItem(storageKeys.user);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const signedOut = (state: AuthState) => {
  state.user = null;
  state.status = 'idle';
  localStorage.removeItem(storageKeys.user);
  tokenStore.clear();
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
    sessionExpired: signedOut,
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
      .addCase(loadSession.rejected, signedOut)
      // Both outcomes sign out. authService.logout() drops the token whatever
      // the server says, so leaving the user in place when the call fails -
      // offline, rate-limited, already expired - would leave the app half
      // signed in: no token, but a user the guards still see.
      .addCase(logout.fulfilled, (state) => {
        signedOut(state);
        state.error = null;
      })
      .addCase(logout.rejected, (state) => {
        signedOut(state);
        state.error = null;
      });
  },
});

export const { clearError, sessionExpired } = authSlice.actions;

export const selectUser = (s: { auth: AuthState }) => s.auth.user;
export const selectIsAuthed = (s: { auth: AuthState }) => s.auth.status === 'authenticated';

/**
 * Signed in AND allowed into the back office.
 *
 * The `status` half matters: ProtectedRoute will not let anyone past without
 * it, so a selector that answered on the user alone would disagree with the
 * guard and bounce the browser between the login page and the page behind it.
 */
export const selectIsAdmin = (s: { auth: AuthState }) =>
  s.auth.status === 'authenticated' && Boolean(s.auth.user && ADMIN_ROLES.includes(s.auth.user.role));

export default authSlice.reducer;
