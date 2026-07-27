import { Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { userPaths } from '@/config/paths';
import { Badge } from '@/components/ui';

/** Sticky branded plate at the top of the user app. */
export function Header() {
  const running = useAppSelector((s) => s.runs.active.length);
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);

  return (
    <header className="safe-top sticky top-0 z-30 flex items-center gap-3 border-b border-black/60 bg-gradient-to-b from-[#202a18] to-[#161c11] px-3.5 pb-3 pt-2.5">
      <div className="flex flex-none items-center rounded-[11px] bg-white px-3 py-1.5">
        <span className="text-[15px] font-extrabold leading-none text-brand-deep">Manna</span>
      </div>

      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.26em] text-ink-faint">
        {user?.role ?? 'Supervisor'}
      </span>

      <div className="flex-1" />

      {!online && <Badge tone="warn">Offline</Badge>}
      <Badge tone={running ? 'run' : 'neutral'} className="tnum">
        {running} running
      </Badge>

      <Link
        to={userPaths.settings}
        aria-label="Settings"
        className="grid h-10 w-10 flex-none place-items-center rounded-[10px] border border-line bg-panel-field text-ink-dim"
      >
        <Settings size={20} />
      </Link>
    </header>
  );
}

export default Header;
