import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { dismissToast } from '@/features/ui/uiSlice';
import { cn } from '@/utils/cn';

/** Renders the toast queue held in the ui slice, as the prototype's `#toast`. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dispatch(dismissToast(t.id)), 2600));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+var(--safe-b))] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cn('toast pointer-events-auto', t.kind)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default Toaster;
