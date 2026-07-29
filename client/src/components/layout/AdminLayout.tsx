import { Outlet } from 'react-router-dom';
import { AdminTopbar } from './AdminTopbar';
import { Toaster } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Shell for the back office. One column at back.html's 820px, no sidebar -
 * the tab strip is the navigation, exactly as in the prototype, which keeps
 * the same layout working on a phone and on a desk.
 */
export function AdminLayout() {
  useOnlineStatus();

  return (
    <div className="back-office">
      <div className="wrap">
        <AdminTopbar />
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
}

export default AdminLayout;
