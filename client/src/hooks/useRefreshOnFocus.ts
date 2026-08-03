import { useEffect, useRef } from 'react';

export interface LiveRefreshOptions {
  /** Poll this often while the screen is being looked at. 0 turns polling off. */
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * Keeps a screen close to the truth without a live feed.
 *
 * A tablet on the plant floor is left open on one tab for a shift, and the yard
 * behind it does not stand still: the lab passes a batch, another vehicle
 * loads, a run is bagged. None of that reaches this device. Worse, it cannot -
 * the accounts are split, so the person who files a lab verdict and the person
 * watching the yard are on different screens by design, and no amount of
 * in-app state sharing crosses between them.
 *
 * So this does the two cheap things that get most of the way there:
 *
 *   on focus     re-read when somebody comes back to the screen. That is the
 *                moment the numbers are about to be trusted, and the moment a
 *                stale figure starts costing something.
 *   on interval  re-read while the screen is actually being looked at, so a
 *                tablet propped open at the gate follows the yard rather than
 *                showing whatever was true when it was opened.
 *
 * The interval stops dead while the tab is hidden. A screen nobody is looking
 * at has nothing to be stale for, and a plant full of tablets polling all night
 * is a bill and a load with no reader.
 *
 * Be clear about what this is not: it is polling, not push. Two people will not
 * see each other's writes the instant they happen - they will see them within
 * an interval. Real-time needs a socket, and that is a different piece of work.
 */
export function useRefreshOnFocus(
  refetch: () => void,
  { intervalMs = 0, enabled = true }: LiveRefreshOptions = {},
) {
  /*
   * The caller's newest refetch, without it being a dependency of the effects.
   * A page's load() is usually rebuilt when its filters change, and a naked
   * dependency would tear down and restack the listeners and the timer on every
   * one of those - so the timer would reset each keystroke and, on a screen
   * that is edited often, never actually fire.
   */
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;

    const run = () => latest.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    // Both events, because they answer different questions: visibilitychange
    // catches the tab being switched back to or the device waking, focus
    // catches the window being clicked into from another app. A browser fires
    // one, the other or both, and a duplicate read is cheaper than a missed one.
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') run();
      }, intervalMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
      if (timer) clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}

export default useRefreshOnFocus;
