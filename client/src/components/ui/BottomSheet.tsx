import { useEffect, useId, useRef, type ReactNode } from 'react';
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
 * scrim on a phone, opens as a centred dialog on a desk screen, and closes on
 * Escape, on the × or on a tap outside. `.sheet` is the skin the back office
 * shares; `.app-sheet` is what fixes it to the screen.
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
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  /** Where focus was before the sheet took it, so it can be handed back. */
  const opener = useRef<HTMLElement | null>(null);
  /**
   * Read through a ref, never a dependency: callers pass a fresh closure on
   * every render, and re-running the effects below on each keystroke would tear
   * focus out of the field being typed into.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  // A sheet that opens without taking focus leaves the keyboard back on the
  // page behind it - the next Tab walks the page, not the form just opened.
  // Strictly on the open/close edge: moving focus mid-edit would fight the user.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const focusable = sheetRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.sheet-x)',
    );
    (focusable ?? sheetRef.current)?.focus({ preventScroll: true });
    return () => opener.current?.focus?.({ preventScroll: true });
  }, [open]);

  return (
    <>
      <div aria-hidden onClick={onClose} className={cn('scrim', open && 'show')} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('sheet app-sheet', open && 'show')}
      >
        <div className="grab" />
        <div className="sheet-h">
          {led && <span className="led" style={{ background: led }} />}
          <b id={titleId}>{title}</b>
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
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
