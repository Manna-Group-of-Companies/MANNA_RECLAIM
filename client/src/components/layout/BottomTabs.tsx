import { NavLink } from 'react-router-dom';
import { Boxes, Layers, Scale, Truck, History, BarChart3 } from 'lucide-react';
import { userPaths } from '@/config/paths';
import { cn } from '@/utils/cn';

/** Same six tabs as the index.html prototype. */
const tabs = [
  { to: userPaths.machines, label: 'Machines', Icon: Boxes },
  { to: userPaths.batches, label: 'Batches', Icon: Layers },
  { to: userPaths.weigh, label: 'Weigh', Icon: Scale },
  { to: userPaths.dispatch, label: 'Dispatch', Icon: Truck },
  { to: userPaths.history, label: 'History', Icon: History },
  { to: userPaths.reports, label: 'Reports', Icon: BarChart3 },
];

export function BottomTabs() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[760px] border-t border-black/70 bg-gradient-to-b from-[#211d15] to-[#171410]">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center gap-1 px-0.5 pb-2 pt-2.5',
              isActive ? 'text-brand' : 'text-ink-faint',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-0 h-0.5 w-6 rounded bg-brand" />}
              <Icon size={22} strokeWidth={1.7} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomTabs;
