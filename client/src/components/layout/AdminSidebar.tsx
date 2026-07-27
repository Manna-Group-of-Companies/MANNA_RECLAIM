import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  History,
  Gauge,
  IndianRupee,
  Calculator,
  Wrench,
  CircleDot,
  Users,
} from 'lucide-react';
import { adminPaths } from '@/config/paths';
import { cn } from '@/utils/cn';

/** Mirrors the back.html tab strip: history, efficiency, rates, costing, maintenance, bearings. */
const links = [
  { to: adminPaths.dashboard, label: 'Dashboard', Icon: LayoutDashboard },
  { to: adminPaths.history, label: 'History', Icon: History },
  { to: adminPaths.efficiency, label: 'Efficiency', Icon: Gauge },
  { to: adminPaths.rates, label: 'Rates', Icon: IndianRupee },
  { to: adminPaths.costing, label: 'Costing', Icon: Calculator },
  { to: adminPaths.maintenance, label: 'Maintenance', Icon: Wrench },
  { to: adminPaths.bearings, label: 'Bearings', Icon: CircleDot },
  { to: adminPaths.users, label: 'Users', Icon: Users },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-field px-3 py-2.5 text-[13.5px] font-semibold',
              isActive ? 'bg-brand/15 text-brand' : 'text-ink-dim hover:bg-panel-raised hover:text-ink',
            )
          }
        >
          <Icon size={18} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default AdminSidebar;
