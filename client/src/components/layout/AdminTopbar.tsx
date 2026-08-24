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
import { BackOfficeDay } from './BackOfficeDay';

/**
 * What a manager runs the plant from: how it did, and what it is being held
 * to. Five tabs, and every one of them is about a shift.
 */
const MANAGER_TABS = [
  { to: adminPaths.dashboard, label: 'Overview' },
  { to: adminPaths.history, label: 'History' },
  { to: adminPaths.efficiency, label: 'Efficiency' },
  { to: adminPaths.approvals, label: 'Approvals' },
  { to: adminPaths.rates, label: 'Rates' },
  { to: adminPaths.ideals, label: 'Ideal values' },
  // Who is on the plant, and the PINs they sign with. A manager runs the
  // shifts, so a manager adds the supervisor who joined on Monday and
  // deactivates the one who left - waiting on the admin account to do it is
  // waiting to be able to log a shift at all.
  { to: adminPaths.users, label: 'Users' },
];

/**
 * The setting-up, which is the admin account's.
 *
 * These are the tabs that change what the plant *is* rather than report on
 * what it did: the machine list, the products, the customers and their rates,
 * the accounts, and the costing that prices all of it. A manager reading a bad
 * shift does not need any of them, and every one of them is a place where a
 * wrong entry quietly rewrites months of figures rather than one row.
 */
const ADMIN_TABS = [
  { to: adminPaths.quality, label: 'Quality' },
  { to: adminPaths.costing, label: 'Costing' },
  { to: adminPaths.maintenance, label: 'Maintenance' },
  { to: adminPaths.bearings, label: 'Bearings' },
  { to: adminPaths.products, label: 'Products' },
  { to: adminPaths.machines, label: 'Machines' },
  { to: adminPaths.customers, label: 'Customers' },
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
   * Hiding a tab is not a guard - the routes carry the same split, so typing
   * the address gets a manager bounced rather than the page. This only keeps
   * the strip to what the account can actually open.
   */
  const tabs = user?.role === 'admin' ? [...MANAGER_TABS, ...ADMIN_TABS] : MANAGER_TABS;
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

      {/*
        Above the tabs, because it governs all of them. Inside a tab it was
        three separate copies of one question and they disagreed.
      */}
      <BackOfficeDay />

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
