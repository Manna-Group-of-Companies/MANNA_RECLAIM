import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { dismissToast } from '@/features/ui/uiSlice';
import { cn } from '@/utils/cn';

/**
 * Renders the toast queue held in the ui slice. Where the stack sits depends on
 * which navigation is on screen - above the tab bar on a phone, clear of the
 * rail on a desk screen - so `.toast-dock` owns the position rather than a
 * hard-coded offset here.
 */
export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dispatch(dismissToast(t.id)), 2600));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  return (
    <div className="toast-dock" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cn('toast', t.kind)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default Toaster;
