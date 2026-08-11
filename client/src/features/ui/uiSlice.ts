import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import { storageKeys } from '@/config/env';
import { SUPERVISORS } from '@/config/constants';
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
  /**
   * The supervisor the tablet is signing records with, once someone has switched
   * it. Null means nobody has, and the signed-in account's own name stands.
   *
   * Held here rather than per-sheet so the choice holds across the start sheet,
   * the stop sheet and the Bearing tab - a shift is signed by one person, not
   * re-picked at every entry. Persisted, because the tablet gets reloaded mid
   * shift and re-picking would be the crew's job to remember.
   */
  supervisor: string | null;
  /**
   * Who the plant's accounts say may sign a record, last read from the server.
   *
   * Was a list of three names in config/constants, copied again into the
   * Flutter app - so a supervisor renamed or added in the back office reached
   * neither, and the pick drifted from the accounts. The constant is now only
   * the fallback for a tablet that has never reached the server. See
   * hooks/useSupervisor.
   */
  signers: string[];
}

const initialState: UiState = {
  toasts: [],
  sheet: { name: null, payload: null },
  online: navigator.onLine,
  refreshTick: 0,
  costingUnlocked: false,
  supervisor: storage.get<string | null>(storageKeys.supervisor, null),
  signers: storage.get<string[]>(storageKeys.signers, SUPERVISORS),
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
    requestRefresh: (state) => {
      state.refreshTick += 1;
    },
    /** Switch who is signing. Blank hands the record back to the account. */
    setSupervisor: (state, action: PayloadAction<string>) => {
      const name = action.payload.trim() || null;
      state.supervisor = name;
      if (name) storage.set(storageKeys.supervisor, name);
      else storage.remove(storageKeys.supervisor);
    },
    /**
     * The names that may sign, as the server has them. An empty answer is
     * ignored: a plant with no supervisors on it is a bad read, not a reason to
     * leave the crew a pick with nothing in it.
     */
    setSigners: (state, action: PayloadAction<string[]>) => {
      const names = action.payload.map((n) => n.trim()).filter(Boolean);
      if (!names.length) return;
      state.signers = names;
      storage.set(storageKeys.signers, names);
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
  requestRefresh,
  setSupervisor,
  setSigners,
  unlockCosting,
  lockCosting,
} = uiSlice.actions;
export default uiSlice.reducer;
