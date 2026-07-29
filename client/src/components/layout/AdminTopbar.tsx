import { NavLink } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { requestRefresh } from '@/features/ui/uiSlice';
import { logout } from '@/features/auth/authSlice';
import { adminPaths, userPaths } from '@/config/paths';
import { cn } from '@/utils/cn';

/** The six back.html tabs, plus the two this port adds. */
const tabs = [
  { to: adminPaths.dashboard, label: 'Overview' },
  { to: adminPaths.history, label: 'History' },
  { to: adminPaths.efficiency, label: 'Efficiency' },
  { to: adminPaths.rates, label: 'Rates' },
  { to: adminPaths.costing, label: 'Costing' },
  { to: adminPaths.maintenance, label: 'Maintenance' },
  { to: adminPaths.bearings, label: 'Bearings' },
  { to: adminPaths.users, label: 'Users' },
];

/**
 * back.html's header: what you are looking at on the left, one Refresh on the
 * right, tab strip underneath. It sticks, because these pages get long and the
 * strip is the only way between them.
 */
export function AdminTopbar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);

  return (
    <header className="bo-head">
      <div className="row">
        <div>
          <h1>Manna Reports</h1>
          <div className="sub">
            Reclaim plant
            {user?.name ? ` · ${user.name}` : ''}
            {online ? '' : ' · offline'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="refresh" onClick={() => dispatch(requestRefresh())}>
            ↻ Refresh
          </button>
          <NavLink to={userPaths.machines} className="refresh">
            Shop floor
          </NavLink>
          <button type="button" className="refresh" onClick={() => void dispatch(logout())}>
            Sign out
          </button>
        </div>
      </div>

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

export default AdminTopbar;
