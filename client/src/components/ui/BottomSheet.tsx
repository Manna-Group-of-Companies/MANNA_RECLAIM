import { useEffect, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface BottomSheetProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Colour of the LED next to the title - the prototype tints it per sheet. */
  led?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * A row of its own under the actions - where the prototype puts the one
   * button that must not sit beside the others, like "Delete this entry".
   */
  after?: ReactNode;
}

/**
 * Every write on the shop floor happens in this sheet: it slides up over a
 * scrim, keeps the page behind it, and closes on Escape or a tap outside.
 */
export function BottomSheet({
  open,
  title,
  subtitle,
  led,
  onClose,
  children,
  footer,
  after,
}: BottomSheetProps) {
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
      <div aria-hidden onClick={onClose} className={cn('scrim', open && 'show')} />
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={cn('sheet', open && 'show')}
      >
        <div className="grab" />
        <div className="sheet-h">
          {led && <span className="led" style={{ background: led }} />}
          <b>{title}</b>
        </div>
        {subtitle && <div className="sheet-sub">{subtitle}</div>}
        {children}
        {footer && <div className="sheet-actions">{footer}</div>}
        {after}
      </div>
    </>
  );
}

export default BottomSheet;
