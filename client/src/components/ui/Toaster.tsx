import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { dismissToast } from '@/features/ui/uiSlice';
import { cn } from '@/utils/cn';

const tones = {
  ok: 'border-state-ok/50',
  err: 'border-state-err/50',
  warn: 'border-state-warn/50',
} as const;

/** Renders the toast queue held in the ui slice. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dispatch(dismissToast(t.id)), 2600));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto max-w-[88%] rounded-full border bg-panel-raised px-4 py-2.5',
            'text-[13px] font-semibold shadow-lg',
            tones[t.kind],
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default Toaster;
