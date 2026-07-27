import { useEffect, useState } from 'react';

/** Re-renders on an interval so running timers keep counting. */
export function useTicker(intervalMs = 1000, enabled = true) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return tick;
}

export default useTicker;
