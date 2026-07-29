import { useEffect, type ReactNode } from 'react';

export interface BoModalProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * back.html's dialog: a sheet from the bottom on a phone, a centred card from
 * 560px up. Used for the run detail, the "how is this calculated" working, and
 * the reason-for-the-dip form.
 */
export function BoModal({ open, title, subtitle, onClose, children, footer }: BoModalProps) {
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

  if (!open) return null;

  return (
    <div className="bo-modal" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h1 className="text-[17px]">{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
        {children}
        <div className="row mt-3.5 justify-end gap-2">
          {footer}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default BoModal;
