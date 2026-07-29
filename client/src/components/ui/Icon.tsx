import { icons, type IconName } from '@/config/icons';
import { cn } from '@/utils/cn';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Draws one of the prototype's stroked glyphs at the given size. */
export function Icon({ name, size = 22, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('flex-none', className)}
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}

export default Icon;
