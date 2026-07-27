import { cn } from '@/utils/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-ink-faint border-t-brand',
        className,
      )}
    />
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-ink-faint">
      <Spinner />
      <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
    </div>
  );
}

export default Spinner;
