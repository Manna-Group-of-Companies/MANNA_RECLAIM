import { configureStore } from '@reduxjs/toolkit';
import { rootReducer, type RootState } from './rootReducer';
import { appEnv } from '@/config/env';

export const store = configureStore({
  reducer: rootReducer,
  devTools: appEnv.devtools && !appEnv.isProd,
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: { ignoredActions: ['ui/openSheet'] },
    }),
});

export type AppStore = typeof store;
export type AppDispatch = typeof store.dispatch;
export type { RootState };
export default store;
