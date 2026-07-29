import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import { storage } from '@/utils/storage';

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
  online: boolean;
  /**
   * Who is on duty. Tagged onto everything logged from this device, so it
   * survives a reload rather than being asked for again every shift.
   */
  supervisor: string;
  /**
   * Bumped by the back office's Refresh button. Pages list it in their effect
   * deps, so one button re-runs whatever the current page fetches without the
   * layout needing to know what that is.
   */
  refreshTick: number;
  /**
   * Whether the Costing tab has been unlocked this session. Held here rather
   * than in the page so switching tabs and coming back does not re-prompt -
   * the prototype kept it in module state and behaved the same. Deliberately
   * not persisted: a reload asks again.
   */
  costingUnlocked: boolean;
}

const SUPERVISOR_KEY = 'manna.supervisor';

const initialState: UiState = {
  toasts: [],
  sheet: { name: null, payload: null },
  online: navigator.onLine,
  supervisor: storage.get<string>(SUPERVISOR_KEY, ''),
  refreshTick: 0,
  costingUnlocked: false,
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
    setOnline: (state, action: PayloadAction<boolean>) => {
      state.online = action.payload;
    },
    setSupervisor: (state, action: PayloadAction<string>) => {
      state.supervisor = action.payload;
      storage.set(SUPERVISOR_KEY, action.payload);
    },
    requestRefresh: (state) => {
      state.refreshTick += 1;
    },
    unlockCosting: (state) => {
      state.costingUnlocked = true;
    },
    lockCosting: (state) => {
      state.costingUnlocked = false;
    },
  },
});

export const {
  toast,
  dismissToast,
  openSheet,
  closeSheet,
  setOnline,
  setSupervisor,
  requestRefresh,
  unlockCosting,
  lockCosting,
} = uiSlice.actions;
export default uiSlice.reducer;
