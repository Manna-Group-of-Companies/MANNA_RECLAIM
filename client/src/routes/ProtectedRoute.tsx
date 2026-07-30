import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { ADMIN_ROLES } from '@/config/constants';
import { homeFor } from '@/config/paths';
import { PageLoader } from '@/components/ui';
import type { Role } from '@/types/models';

export interface ProtectedRouteProps {
  /** Where to send an unauthenticated visitor. */
  redirectTo: string;
  /** When true, only manager/admin roles may pass. */
  adminOnly?: boolean;
  /** When set, only these roles may pass. Everyone else goes to their own home. */
  allow?: Role[];
}

export function ProtectedRoute({ redirectTo, adminOnly = false, allow }: ProtectedRouteProps) {
  const { user, status } = useAppSelector((s) => s.auth);
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Checking session" />;
  if (status !== 'authenticated' || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }
  // Bounced to the role's own home rather than a fixed page: a lab account sent
  // to /machines would be turned away there too, and the two guards would trade
  // the browser back and forth.
  if (adminOnly && !ADMIN_ROLES.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <Outlet />;
}

export default ProtectedRoute;
