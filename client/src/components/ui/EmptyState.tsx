import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  /** Raw `<path>` markup for a 24x24 stroked icon, as in the prototype. */
  icon?: string;
  action?: ReactNode;
}

/**
 * The prototype's `empty()` helper: a stroked glyph, one line of what is
 * missing, and one line of how to make it appear.
 */
export function EmptyState({ title, hint, icon, action }: EmptyStateProps) {
  return (
    <div className="empty">
      {icon && (
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icon }} />
      )}
      <div className="big">{title}</div>
      {hint && <div className="mx-auto max-w-xs text-xs leading-relaxed">{hint}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export default EmptyState;
