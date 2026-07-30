import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { homeFor } from '@/config/paths';

/**
 * What `/` means depends on who signed in: the floor opens on Machines, the lab
 * tablet on Quality. Sending everyone to Machines would leave a lab account
 * bounced straight back out by the guard on that page.
 */
export function RoleHome() {
  const role = useAppSelector((s) => s.auth.user?.role);
  return <Navigate to={homeFor(role)} replace />;
}

export default RoleHome;
