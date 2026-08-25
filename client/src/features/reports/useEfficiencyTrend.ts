import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { reportService } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import { lastNDays, todayISO } from '@/utils/date';
import type { EfficiencyTrend } from '@/types/models';

/**
 * One line, grade or vessel followed across a window - the window, the subject,
 * and what came back.
 *
 * A hook rather than a component because the two screens that ask this question
 * cannot share a layout. The back office draws it as a table and the tablet as a
 * stack of cards - nearly every class the back office uses is declared under
 * `.back-office`, so the same markup on a tablet renders as bare text. What they
 * do share is every decision worth getting wrong: which window, which subject,
 * when to re-read, and what to do when there is nothing to show.
 *
 * `enabled` is how the tablet keeps this off its critical path. The shift view
 * is what the crew opened the tab for; the period is a question they ask
 * sometimes, so it is folded away and costs no request until it is opened.
 */
export function useEfficiencyTrend({ days = 30, enabled = true } = {}) {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [window, setWindow] = useState(days);
  const [from, setFrom] = useState(() => lastNDays(days).from);
  const [to, setTo] = useState(() => todayISO());
  const [subject, setSubject] = useState('');
  const [data, setData] = useState<EfficiencyTrend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** A named window, both ends at once - the common way of asking. */
  const pickWindow = (n: number) => {
    setWindow(n);
    const w = lastNDays(n);
    setFrom(w.from);
    setTo(w.to);
  };

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      setData(await reportService.efficiencyTrend({ from, to, subject: subject || undefined }));
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [enabled, from, to, subject]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  /*
   * Open on something rather than on an empty picker.
   *
   * A screen whose first state is "pick one of these twelve" makes the reader do
   * the work before it has shown them anything. The first subject is as good a
   * starting point as any: what they came to compare, they will pick.
   */
  useEffect(() => {
    if (subject || !data?.subjects.length) return;
    setSubject(data.subjects[0]!.key);
  }, [data, subject]);

  return {
    window,
    from,
    to,
    subject,
    data,
    loading,
    error,
    /** Whether a named window is the one showing, for the chips to light up. */
    isWindow: (n: number) => window === n && from === lastNDays(n).from && to === todayISO(),
    pickWindow,
    setFrom,
    setTo,
    setSubject,
  };
}

export default useEfficiencyTrend;
