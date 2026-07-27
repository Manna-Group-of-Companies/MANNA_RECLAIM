import { useEffect } from 'react';
import { useAppDispatch } from '@/app/hooks';
import { setOnline } from '@/features/ui/uiSlice';
import { flushQueue } from '@/features/machines/runsSlice';

/** Tracks connectivity and replays anything queued while offline. */
export function useOnlineStatus() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const online = () => {
      dispatch(setOnline(true));
      void dispatch(flushQueue());
    };
    const offline = () => dispatch(setOnline(false));

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [dispatch]);
}

export default useOnlineStatus;
