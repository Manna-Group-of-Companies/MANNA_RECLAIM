import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { ADMIN_ROLES } from '@/config/constants';
import { PageLoader } from '@/components/ui';

export interface ProtectedRouteProps {
  /** Where to send an unauthenticated visitor. */
  redirectTo: string;
  /** When true, only manager/admin roles may pass. */
  adminOnly?: boolean;
}

export function ProtectedRoute({ redirectTo, adminOnly = false }: ProtectedRouteProps) {
  const { user, status } = useAppSelector((s) => s.auth);
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Checking session" />;
  if (status !== 'authenticated' || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && !ADMIN_ROLES.includes(user.role)) {
    return <Navigate to="/machines" replace />;
  }
  return <Outlet />;
}

export default ProtectedRoute;
