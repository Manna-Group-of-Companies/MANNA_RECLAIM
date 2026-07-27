import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: string;
  active?: boolean;
  children: ReactNode;
}

/** Panel with the 4px accent rail used by every machine / batch card. */
export function Card({ accent, active = false, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'panel relative overflow-hidden px-4 py-4 pl-5',
        active && 'border-brand/50 shadow-[0_0_22px_-10px_theme(colors.brand.DEFAULT)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1', active ? 'opacity-100' : 'opacity-50')}
        style={{ background: accent ?? 'currentColor' }}
      />
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3 flex items-center gap-3', className)}>{children}</div>;
}

export default Card;
