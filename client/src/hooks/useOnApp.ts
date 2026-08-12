import { useCallback, useEffect, useState } from 'react';
import { userService } from '@/api/services/user.service';
import { useRefreshOnFocus } from './useRefreshOnFocus';
import { onAppNow, type Present } from '@/utils/presence';
import type { User } from '@/types/models';

/** How often the nav bar re-asks. Well inside the presence window either way. */
const POLL_MS = 60_000;

/**
 * Which of the crew is on the supervisor app, kept current.
 *
 * For the back office only - the accounts list it reads is manager/admin, and
 * the shop-floor tabs are refused it. Every screen in the back office is inside
 * that gate, which is why this can be called from the topbar without a guard.
 *
 * Failures are swallowed on purpose. This is an ornament on the header, not the
 * page somebody came to read: a toast from up here would interrupt whatever
 * they are actually doing, once a minute, to tell them about a list they did
 * not ask for. It simply goes quiet, and a quiet bar is the same thing the bar
 * shows when nobody is on the floor.
 */
export function useOnApp(): Present[] {
  const [rows, setRows] = useState<User[]>([]);

  const load = useCallback(async () => {
    try {
      setRows((await userService.list({ limit: 200 })).rows);
    } catch {
      // Deliberately silent - see above.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(load, { intervalMs: POLL_MS });

  /*
   * Derived on render rather than memoised against `rows`. Presence is a
   * comparison against the clock, so the answer changes as time passes and not
   * only when the rows do - the poll above is what re-renders it, and the work
   * is a filter over a dozen accounts.
   */
  return onAppNow(rows);
}

export default useOnApp;
