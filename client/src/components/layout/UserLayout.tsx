import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomTabs } from './BottomTabs';
import { Toaster } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** Shell for the shop-floor app (the index.html side). */
export function UserLayout() {
  useOnlineStatus();

  return (
    <div className="mx-auto flex min-h-full max-w-[760px] flex-col pb-[calc(74px+var(--safe-b))]">
      <Header />
      <main className="flex-1 px-3.5 pb-2 pt-3.5">
        <Outlet />
      </main>
      <BottomTabs />
      <Toaster />
    </div>
  );
}

export default UserLayout;
