import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { PlantSummary } from '@/features/reports/PlantSummary';
import { lastNDays } from '@/utils/date';

/**
 * What the plant made and what it cost, over the last week, month or quarter.
 *
 * The same figures the back office opens on, and the same single request - the
 * difference is what is not fetched beside them. The Overview tab also asks for
 * the open breakdowns and the bearings due, both of which are the back office's
 * routes; asking for them here would have the screen half-fill and then log two
 * 403s on every load, for a list whose every row links to a page this account
 * cannot open.
 */
export function MdOverviewPage() {
  const dispatch = useAppDispatch();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const error = useAppSelector((s) => s.reports.error);
  const [days, setDays] = useState(7);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(days)));
  }, [dispatch, days, refreshTick]);

  return (
    <>
      {error && (
        <div className="errbox" role="alert">
          {error}
        </div>
      )}
      <PlantSummary days={days} onDays={setDays} />
    </>
  );
}

export default MdOverviewPage;
