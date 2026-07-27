import { useEffect, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface BottomSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** The user side edits everything through this sheet, as in the prototype. */
export function BottomSheet({ open, title, subtitle, onClose, children, footer }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-[760px] overflow-y-auto',
          'rounded-t-[20px] border border-b-0 border-line bg-gradient-to-b from-panel-raised to-panel px-5 pb-6 pt-2 shadow-sheet',
          'transition-transform duration-200',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-4 mt-1.5 h-1 w-9 rounded bg-line-strong" />
        <h2 className="text-[19px] font-extrabold">{title}</h2>
        {subtitle && <p className="mb-4 mt-1 text-xs text-ink-faint">{subtitle}</p>}
        <div className="space-y-3">{children}</div>
        {footer && <div className="mt-5 flex gap-3">{footer}</div>}
      </div>
    </>
  );
}

export default BottomSheet;
