import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { Toaster } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { toggleSidebar } from '@/features/ui/uiSlice';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/utils/cn';

/** Shell for the back office (the back.html side). */
export function AdminLayout() {
  useOnlineStatus();
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.sidebarOpen);

  return (
    <div className="flex min-h-full">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-line bg-bg-soft transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-4 py-4 text-lg font-extrabold text-brand">Manna Admin</div>
        <AdminSidebar onNavigate={() => dispatch(toggleSidebar(false))} />
      </aside>

      {open && (
        <div
          aria-hidden
          onClick={() => dispatch(toggleSidebar(false))}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar />
        <main className="flex-1 space-y-4 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  );
}

export default AdminLayout;
