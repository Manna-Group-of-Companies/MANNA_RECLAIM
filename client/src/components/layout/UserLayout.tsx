import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomTabs } from './BottomTabs';
import { Toaster } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAppDispatch } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import { fetchActiveRuns, fetchPendingPack, fetchPendingWeigh } from '@/features/machines/runsSlice';
import { fetchPendingQuality } from '@/features/quality/qualitySlice';
import { fetchBearingsDue } from '@/features/maintenance/maintenanceSlice';

/**
 * Shell for the shop-floor app. The counts behind the tab badges are loaded
 * here rather than on each tab, so a worker sitting on Machines still sees
 * that three runs are waiting to be weighed.
 */
export function UserLayout() {
  useOnlineStatus();
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchActiveRuns());
    void dispatch(fetchPendingWeigh());
    void dispatch(fetchPendingPack());
    void dispatch(fetchPendingQuality());
    void dispatch(fetchBearingsDue());
  }, [dispatch]);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-view">
        <Outlet />
      </main>
      <BottomTabs />
      <Toaster />
    </div>
  );
}

export default UserLayout;
