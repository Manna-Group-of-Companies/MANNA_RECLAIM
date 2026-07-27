import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export type ToastKind = 'ok' | 'err' | 'warn';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface UiState {
  toasts: Toast[];
  /** Bottom sheet on the user side: which one is open and its payload. */
  sheet: { name: string | null; payload: unknown };
  sidebarOpen: boolean;
  online: boolean;
}

const initialState: UiState = {
  toasts: [],
  sheet: { name: null, payload: null },
  sidebarOpen: false,
  online: navigator.onLine,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toast: {
      reducer: (state, action: PayloadAction<Toast>) => {
        state.toasts.push(action.payload);
      },
      prepare: (message: string, kind: ToastKind = 'ok') => ({
        payload: { id: nanoid(), message, kind },
      }),
    },
    dismissToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    openSheet: (state, action: PayloadAction<{ name: string; payload?: unknown }>) => {
      state.sheet = { name: action.payload.name, payload: action.payload.payload ?? null };
    },
    closeSheet: (state) => {
      state.sheet = { name: null, payload: null };
    },
    toggleSidebar: (state, action: PayloadAction<boolean | undefined>) => {
      state.sidebarOpen = action.payload ?? !state.sidebarOpen;
    },
    setOnline: (state, action: PayloadAction<boolean>) => {
      state.online = action.payload;
    },
  },
});

export const { toast, dismissToast, openSheet, closeSheet, toggleSidebar, setOnline } = uiSlice.actions;
export default uiSlice.reducer;
