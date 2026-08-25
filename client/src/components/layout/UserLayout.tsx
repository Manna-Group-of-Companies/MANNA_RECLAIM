import { useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomTabs } from './BottomTabs';
import { Toaster } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useAppDispatch } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import { fetchActiveRuns, fetchPendingWeigh } from '@/features/machines/runsSlice';
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

    void dispatch(fetchPendingQuality());
    void dispatch(fetchBearingsDue());
  }, [dispatch]);

  /*
   * And re-read the greasing schedule while the tab is being looked at.
   *
   * useBearingDue keeps the countdown honest against the clock, which is what
   * makes a machine start asking for temperatures without a reload. This is the
   * other direction: the temperatures are taken at the machine, often on the
   * tablet that is nearest rather than the one that flagged it, and until that
   * reading is re-read this device goes on pulsing at a job somebody has
   * already done. `lastAt` is the server's fact and only a fetch brings it.
   *
   * Two minutes against a two-to-three hour interval - a cheap call, and well
   * inside the window in which a crew would notice the button still lit.
   */
  const refreshBearings = useCallback(() => void dispatch(fetchBearingsDue()), [dispatch]);
  useRefreshOnFocus(refreshBearings, { intervalMs: 120_000 });

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
