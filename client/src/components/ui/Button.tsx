import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'ghost' | 'elec' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

/** `outline` has no prototype equivalent - it is the bare `.btn` shell. */
const variants: Record<Variant, string> = {
  primary: 'primary',
  ghost: 'ghost',
  elec: 'elec',
  danger: 'danger',
  outline: '',
};

/** `lg` is the prototype's `.btn.block`; `sm` shrinks it for an inline card action. */
const sizes: Record<Size, string> = {
  sm: 'px-3 py-2 text-xs',
  md: '',
  lg: 'block',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={cn('btn', variants[variant], sizes[size], className)}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export default Button;
