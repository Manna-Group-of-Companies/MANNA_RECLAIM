import { NavLink } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { userPaths } from '@/config/paths';
import { Icon } from '@/components/ui';
import type { IconName } from '@/config/icons';
import type { Role } from '@/types/models';
import { FLOOR_ROLES, LAB_ROLES } from '@/config/constants';
import { useBearingDue } from '@/hooks/useBearingDue';
import { cn } from '@/utils/cn';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Which pending count sits on the badge, if any. */
  badge?: 'weigh' | 'packing' | 'quality' | 'bearing';
  /** Who this tab is for. A tab is floor work unless it says otherwise. */
  roles?: Role[];
}

/** The eight shop-floor tabs, in the prototype's order. */
const tabs: Tab[] = [
  { to: userPaths.machines, label: 'Machines', icon: 'machines' },
  { to: userPaths.batches, label: 'Batches', icon: 'batches' },
  { to: userPaths.weigh, label: 'Weigh', icon: 'weigh', badge: 'weigh' },
  { to: userPaths.packing, label: 'Packing', icon: 'packing', badge: 'packing' },
  // What is packed and ready to go. A manager and a supervisor read different
  // responses from the API here - the full table and a summary - rather than
  // the same one drawn two ways, and only the manager can issue a dispatch off
  // it. See StockPage.
  { to: userPaths.stock, label: 'Stock', icon: 'dispatch' },
  { to: userPaths.quality, label: 'Quality', icon: 'quality', badge: 'quality', roles: LAB_ROLES },
  { to: userPaths.history, label: 'History', icon: 'history' },
  { to: userPaths.bearing, label: 'Bearing', icon: 'bearing', badge: 'bearing' },
];

/** What a badge count means, so it is not read out as a bare number. */
const badgeNoun: Record<NonNullable<Tab['badge']>, string> = {
  weigh: 'waiting to be weighed',
  packing: 'waiting to be packed',
  quality: 'awaiting test',
  bearing: 'due for temperatures',
};

/**
 * Badges are the whole point of this bar: they are how the crew knows there is
 * work waiting on a tab they are not looking at. The bar is the same markup at
 * every size - `.tabs` lays it along the bottom of a phone and turns it into a
 * left rail from 900px up.
 *
 * What it holds depends on who is holding the tablet: the lab gets Quality and
 * only Quality, the floor gets the other seven. The routes enforce the same
 * split, so a hidden tab is not a hidden page - it is a page that is not theirs.
 */
export function BottomTabs() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const pendingWeigh = useAppSelector((s) => s.runs.pendingWeigh.length);
  const pendingPack = useAppSelector((s) => s.runs.pendingPack.length);
  const pendingQuality = useAppSelector((s) => s.quality.pending.length);
  // Counted off the live figures rather than the fetched ones: the badge is how
  // the crew learns there is work on a tab they are not looking at, and a count
  // frozen at whatever was true when the tablet was opened never learns them
  // anything. See useBearingDue.
  const bearingsDue = useBearingDue().filter((d) => d.due).length;

  const counts = {
    weigh: pendingWeigh,
    packing: pendingPack,
    quality: pendingQuality,
    bearing: bearingsDue,
  } as const;

  const visible = role ? tabs.filter((tab) => (tab.roles ?? FLOOR_ROLES).includes(role)) : [];

  return (
    <nav className="tabs" aria-label="Sections">
      {visible.map(({ to, label, icon, badge }) => {
        const count = badge ? counts[badge] : 0;
        return (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) => cn(isActive && 'active')}
          >
            {count > 0 && (
              <i className="tabbadge">
                {count}
                <span className="sr-only"> {badge ? badgeNoun[badge] : ''}</span>
              </i>
            )}
            <Icon name={icon} size={23} />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomTabs;
