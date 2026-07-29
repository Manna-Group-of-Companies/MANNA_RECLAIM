import { NavLink } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { userPaths } from '@/config/paths';
import { Icon } from '@/components/ui';
import type { IconName } from '@/config/icons';
import { cn } from '@/utils/cn';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Which pending count sits on the badge, if any. */
  badge?: 'weigh' | 'packing' | 'quality' | 'bearing';
}

/** The eight shop-floor tabs, in the prototype's order. */
const tabs: Tab[] = [
  { to: userPaths.machines, label: 'Machines', icon: 'machines' },
  { to: userPaths.batches, label: 'Batches', icon: 'batches' },
  { to: userPaths.weigh, label: 'Weigh', icon: 'weigh', badge: 'weigh' },
  { to: userPaths.packing, label: 'Packing', icon: 'packing', badge: 'packing' },
  { to: userPaths.dispatch, label: 'Dispatch', icon: 'dispatch' },
  { to: userPaths.quality, label: 'Quality', icon: 'quality', badge: 'quality' },
  { to: userPaths.history, label: 'History', icon: 'history' },
  { to: userPaths.bearing, label: 'Bearing', icon: 'bearing', badge: 'bearing' },
];

/**
 * Badges are the whole point of this bar: they are how the crew knows there is
 * work waiting on a tab they are not looking at.
 */
export function BottomTabs() {
  const pendingWeigh = useAppSelector((s) => s.runs.pendingWeigh.length);
  const pendingPack = useAppSelector((s) => s.runs.pendingPack.length);
  const pendingQuality = useAppSelector((s) => s.quality.pending.length);
  const bearingsDue = useAppSelector((s) => s.maintenance.due.filter((d) => d.due).length);

  const counts = {
    weigh: pendingWeigh,
    packing: pendingPack,
    quality: pendingQuality,
    bearing: bearingsDue,
  } as const;

  return (
    <nav className="tabs">
      {tabs.map(({ to, label, icon, badge }) => {
        const count = badge ? counts[badge] : 0;
        return (
          <NavLink key={to} to={to} className={({ isActive }) => cn(isActive && 'active')}>
            {count > 0 && <i className="tabbadge">{count}</i>}
            <Icon name={icon} size={23} />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomTabs;
