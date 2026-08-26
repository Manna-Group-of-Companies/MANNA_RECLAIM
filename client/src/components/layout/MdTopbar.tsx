import { NavLink } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { requestRefresh } from '@/features/ui/uiSlice';
import { logout } from '@/features/auth/authSlice';
import { mdPaths } from '@/config/paths';
import { cn } from '@/utils/cn';
import { BackOfficeDay } from './BackOfficeDay';

/** Seven tabs, and that is the account. */
const tabs = [
  { to: mdPaths.overview, label: 'Overview' },
  { to: mdPaths.efficiency, label: 'Efficiency' },
  { to: mdPaths.approvals, label: 'Approvals' },
  { to: mdPaths.quality, label: 'Quality' },
  { to: mdPaths.stock, label: 'Stock' },
  { to: mdPaths.dispatches, label: 'Dispatches' },
  { to: mdPaths.history, label: 'History' },
];

/**
 * The managing director's header.
 *
 * Its own bar rather than AdminTopbar with a shorter tab list, because most of
 * what that one carries is for somebody running the plant day to day: who is
 * signed in on the shop floor right now, and a link across to the floor app. An
 * MD is not about to open a run sheet, and a header full of controls that go
 * nowhere useful is how a summary screen stops reading as one.
 */
export function MdTopbar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);
  const busy = useAppSelector((s) => s.reports.loading);

  return (
    <header className="bo-head">
      <div className="row">
        <div>
          <h1>Manna Reclaim</h1>
          <div className="sub">
            Managing director
            {user?.name ? ` · ${user.name}` : ''}
            {online ? '' : ' · offline'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="refresh"
            onClick={() => dispatch(requestRefresh())}
            disabled={busy}
            aria-busy={busy}
          >
            <span className={cn('inline-block', busy && 'animate-spin')} aria-hidden="true">
              ↻
            </span>{' '}
            {busy ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="refresh" onClick={() => void dispatch(logout())}>
            Sign out
          </button>
        </div>
      </div>

      <BackOfficeDay />

      <nav className="tabstrip">
        {tabs.map(({ to, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cn('tab', isActive && 'on')}>
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export default MdTopbar;
