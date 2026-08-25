import { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import { whenLast } from '@/utils/date';
import { num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { SapStock } from '@/types/models';

/**
 * The yard as SAP holds it.
 *
 * The plant used to keep its own stock ledger from packing typed by supervisors
 * on the floor. That is off - the plant is too busy to keep a bagging bench up
 * to date, and a figure nobody has time to type is a figure that drifts - so a
 * scheduled script on the plant server reads the Manna Rubber Products SAP box
 * and posts what it finds.
 *
 * The age of the reading is not a footnote here, it is the first thing on the
 * panel. An unattended job that has been failing for a week goes on showing a
 * week-old yard, and the failure is invisible from the numbers themselves:
 * stale stock looks exactly like stock. So the panel says when SAP was last
 * read, and says it louder once that is old enough to matter.
 */

/**
 * How stale is worth saying out loud.
 *
 * The sync is meant to run every fifteen minutes. Six hours is long enough that
 * a run has been missed many times over and short enough that somebody reading
 * a morning figure is warned before they act on it.
 */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function SapStockPanel() {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [data, setData] = useState<SapStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    stockService
      .sap()
      .then((got) => live && (setData(got), setError('')))
      .catch((err) => live && setError(toRequestError(err).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [refreshTick]);

  if (loading && !data) return <div className="empty">Reading the yard…</div>;

  if (error) {
    return (
      <div className="hint" style={{ color: 'var(--err)' }}>
        Couldn’t read the SAP stock: {error}
      </div>
    );
  }

  /*
   * Nothing has ever landed, which is not the same as an empty yard and must
   * not be drawn as one. Said as what it is: the feed has not run here yet.
   */
  if (!data?.sync) {
    return (
      <div className="empty">
        No stock has come from SAP yet. The sync on the plant server posts it —
        until it has run once, there is nothing here to show.
      </div>
    );
  }

  const age = Date.now() - Date.parse(data.sync.asOf);
  const stale = Number.isFinite(age) && age > STALE_AFTER_MS;

  /* Grouped by grade, which is how the plant asks the question. Items nobody
     has mapped fall under one heading that names itself as the gap it is. */
  const byGrade = new Map<string, typeof data.rows>();
  for (const r of data.rows) {
    const key = r.grade ?? '';
    byGrade.set(key, [...(byGrade.get(key) ?? []), r]);
  }
  const grades = [...byGrade.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  return (
    <>
      <div className={cn('effsum', stale && 'flag')}>
        {Object.entries(data.totals.byUnit).map(([unit, qty], i) => (
          <span key={unit}>
            {i > 0 && ' · '}
            <b>{num(qty, 0)}</b> {unit}
          </span>
        ))}
        <div className="effnote">
          {/*
            When SAP was read, not when it arrived. A script that queried at six
            and posted at nine after three retries is reporting six o'clock's
            stock, and the difference is the whole reason both are recorded.
          */}
          from SAP · read {whenLast(data.sync.asOf)} · {data.totals.rows} lines
        </div>
        {stale && (
          <div className="effnote" style={{ color: 'var(--err)' }}>
            This is more than six hours old. The sync runs every fifteen minutes, so it has been
            failing — check the log on the plant server before acting on these figures.
          </div>
        )}
      </div>

      {grades.map((grade) => {
        const rows = byGrade.get(grade)!;
        return (
          <div key={grade || 'unmapped'} className="effblock">
            <div className="effhead">
              <b>{grade || 'Not mapped to a grade'}</b>
              <span className="effnote">
                {rows.map((r) => r.quantity).reduce((a, b) => a + b, 0).toFixed(0)}{' '}
                {rows[0]?.unit ?? 'kg'}
              </span>
            </div>
            {rows.map((r) => (
              <div
                key={`${r.sku}|${r.batch ?? ''}|${r.warehouse ?? ''}`}
                className="effline"
              >
                <div className="effname">
                  <div>
                    {r.description ?? r.sku}
                    <div className="muted text-[11px]">
                      {r.sku}
                      {r.batch && ` · batch ${r.batch}`}
                      {r.warehouse && ` · ${r.warehouse}`}
                    </div>
                  </div>
                </div>
                <div className="effnums">
                  <b>{num(r.quantity, 0)}</b>
                  <span className="efftarget">{r.unit}</span>
                </div>
              </div>
            ))}
            {!grade && (
              <div className="hint">
                SAP is holding these and nobody has told this app what grade they are. They are
                shown rather than hidden — an item that is not mapped is stock that would
                otherwise silently not exist. The mapping is a table at the top of the sync
                script on the plant server.
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default SapStockPanel;
