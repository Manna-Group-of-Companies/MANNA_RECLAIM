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

  /**
   * Lift the sheet off the on-screen keyboard.
   *
   * The sheet is fixed to the bottom of the *layout* viewport and capped at a
   * share of `vh`, and neither of those moves when a tablet keyboard opens - so
   * the sheet stayed exactly where it was, with the keyboard drawn on top of it
   * and the field being typed into underneath. The crew could see the sheet,
   * could not see what they were writing in it.
   *
   * `visualViewport` is the one thing that does know: its height shrinks to what
   * is actually visible and `offsetTop` says how far the browser scrolled the
   * page to keep the caret up. The difference from `innerHeight` is the
   * keyboard, so the sheet sits on top of it and gives back the space when it
   * closes.
   *
   * Written to CSS custom properties rather than to `style.bottom` so the
   * stylesheet keeps the layout and this only supplies the two measurements.
   * Browsers without visualViewport - and desktops, where the sheet is a
   * centred dialog - get nothing and behave exactly as before.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    const el = sheetRef.current;
    if (!open || !vv || !el) return;

    const fit = () => {
      const lifted = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty('--kb', `${Math.round(lifted)}px`);
      // What is left to be a sheet in, once the keyboard has taken its share.
      el.style.setProperty('--vv', `${Math.round(vv.height)}px`);
    };

    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      el.style.removeProperty('--kb');
      el.style.removeProperty('--vv');
    };
  }, [open]);

  /**
   * And keep the field being typed into on screen.
   *
   * Lifting the sheet is not enough on its own: a long sheet still scrolls
   * inside itself, and the field that was tapped can sit below the fold of what
   * is left. The browser's own scroll-into-view fires against the layout
   * viewport and so does nothing useful here; this one runs after the keyboard
   * has finished animating and scrolls the sheet's own box.
   */
  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const field = e.target as HTMLElement | null;
      if (!field || !el.contains(field)) return;
      window.setTimeout(() => {
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 250);
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
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
