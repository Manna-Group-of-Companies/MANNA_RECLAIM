import type { ReactNode } from 'react';

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-ink-faint">
      {icon}
      <p className="text-[15px] text-ink-dim">{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default EmptyState;
