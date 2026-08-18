import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { requestRefresh } from '@/features/ui/uiSlice';
import { logout } from '@/features/auth/authSlice';
import { adminPaths, userPaths } from '@/config/paths';
import { cn } from '@/utils/cn';
import { useOnApp } from '@/hooks/useOnApp';
import { minsAgo } from '@/utils/presence';
import { clock24 } from '@/utils/date';

/** The six back.html tabs, plus the eight this port adds. */
const tabs = [
  { to: adminPaths.dashboard, label: 'Overview' },
  { to: adminPaths.history, label: 'History' },
  { to: adminPaths.quality, label: 'Quality' },
  { to: adminPaths.efficiency, label: 'Efficiency' },
  { to: adminPaths.rates, label: 'Rates' },
  { to: adminPaths.ideals, label: 'Ideal values' },
  { to: adminPaths.costing, label: 'Costing' },
  { to: adminPaths.maintenance, label: 'Maintenance' },
  { to: adminPaths.bearings, label: 'Bearings' },
  { to: adminPaths.products, label: 'Products' },
  { to: adminPaths.machines, label: 'Machines' },
  { to: adminPaths.customers, label: 'Customers' },
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
  /*
   * Who is on the shop floor, up here rather than only on Users, because it is
   * the thing a manager wants to know without going to look for it - and it is
   * the answer that changes while they are reading something else. The crew
   * only: this bar is being read by the back office, and the back office is not
   * on the app.
   */
  const onApp = useOnApp();
  /*
   * Every tab fetches from a different slice, and the header has no way of
   * knowing which one the current page is using - so it watches all of them.
   * Refresh dispatches a tick and nothing visibly happens for a second or
   * two otherwise, which reads as a dead button and gets clicked again.
   */
  const busy = useAppSelector(
    (s) =>
      s.reports.loading ||
      s.maintenance.loading ||
      s.quality.loading ||
      s.rates.loading ||
      s.products.loading ||
      s.runs.loading,
  );

  /*
   * Ten tabs do not fit a phone, so the strip scrolls - and on Users, the
   * last of them, a reload would show tabs one to five and no sign of where
   * you are. Pull the active one into view whenever the route changes.
   */
  const strip = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    strip.current
      ?.querySelector('.tab.on')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

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
          {/*
           * Names, and the time each was last heard from. The time is the point
           * as much as the name is: "Mathai 14:32" at 14:35 is somebody at a
           * machine, and the same line at 16:00 would be somebody who has gone
           * - which is why the row empties itself rather than holding the last
           * name it saw. Each one goes to Users, where the same list is shown
           * with what it means written out.
           */}
          <div className="sub mt-1 flex flex-wrap items-center gap-1.5">
            <span>Shop floor</span>
            {onApp.length ? (
              onApp.map(({ user: hand, at }) => (
                <NavLink
                  key={hand.id}
                  to={adminPaths.users}
                  className="badge ok"
                  title={`${hand.name} - last heard from ${minsAgo(at)}`}
                >
                  {hand.name} · {clock24(new Date(at).toISOString())}
                </NavLink>
              ))
            ) : (
              <span className="badge none">nobody signed in</span>
            )}
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
          <NavLink to={userPaths.machines} className="refresh">
            Shop floor
          </NavLink>
          <button type="button" className="refresh" onClick={() => void dispatch(logout())}>
            Sign out
          </button>
        </div>
      </div>

      <nav className="tabstrip" ref={strip}>
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
