import { LogOut, Menu } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { toggleSidebar } from '@/features/ui/uiSlice';
import { appEnv } from '@/config/env';

export function AdminTopbar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg-soft/95 px-4 py-3 backdrop-blur">
      <button
        onClick={() => dispatch(toggleSidebar(undefined))}
        aria-label="Toggle navigation"
        className="grid h-9 w-9 place-items-center rounded-field border border-line text-ink-dim lg:hidden"
      >
        <Menu size={18} />
      </button>

      <div>
        <p className="text-sm font-bold leading-tight">{appEnv.appName}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">Back office</p>
      </div>

      <div className="flex-1" />

      <span className="hidden text-xs text-ink-dim sm:block">
        {user?.name} - {user?.role}
      </span>
      <button
        onClick={() => void dispatch(logout())}
        className="flex items-center gap-2 rounded-field border border-line px-3 py-2 text-xs font-bold text-ink-dim hover:text-ink"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </header>
  );
}

export default AdminTopbar;
