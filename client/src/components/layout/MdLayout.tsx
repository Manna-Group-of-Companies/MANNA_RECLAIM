import { Outlet } from 'react-router-dom';
import { MdTopbar } from './MdTopbar';
import { Toaster } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Shell for the managing director's two screens. The back office's one column,
 * because these are the back office's pages read by somebody else - and nothing
 * is prefetched here: both tabs fetch what they need and there is no badge on
 * this bar that would need a count kept warm.
 */
export function MdLayout() {
  useOnlineStatus();

  return (
    <div className="back-office">
      <div className="wrap">
        <MdTopbar />
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
}

export default MdLayout;
