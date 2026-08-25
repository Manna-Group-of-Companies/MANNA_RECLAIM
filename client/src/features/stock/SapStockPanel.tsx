import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import { whenLast } from '@/utils/date';
import { num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { SapStock, SapStockRow } from '@/types/models';

/**
 * The yard, as SAP holds it.
 *
 * The plant used to keep its own stock ledger from packing typed by supervisors
 * on the floor. That is off - the plant is too busy to keep a bagging bench up
 * to date, and a figure nobody has time to type is a figure that drifts - so a
 * scheduled script on the plant server reads the Manna Rubber Products SAP box
 * and posts what it finds.
 *
 * Read by grade and then by batch, which is how the plant asks the question. A
 * special-line batch is a thing somebody goes looking for by number: an order
 * is filled from a batch, the lab passed a batch, and "how much Fine is there"
 * is a different question from "is 3140 still in the yard". Coarse is not
 * batch-identified - the line runs for a shift rather than for a charge - so its
 * rows carry no batch and club into one line, which is the honest shape rather
 * than a heading per sack.
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

/** What a set of rows comes to, per unit - kg and pieces are never added. */
const totalOf = (rows: SapStockRow[]) => {
  const byUnit = new Map<string, number>();
  for (const r of rows) byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + r.quantity);
  return [...byUnit].map(([unit, qty]) => `${num(qty, 0)} ${unit}`).join(' · ');
};

/**
 * One batch of one grade, and what SAP is holding against it.
 *
 * The lines underneath are only drawn where there is more than one - a batch
 * sitting in two warehouses, or under two item codes. With one they would
 * repeat the heading in smaller type, which is how a screen teaches people to
 * stop reading it.
 */
function Batch({ label, rows }: { label: string; rows: SapStockRow[] }) {
  return (
    <div className="effline">
      <div className="effname">
        <div>
          {label}
          <div className="muted text-[11px]">
            {rows.length === 1
              ? [rows[0]!.description ?? rows[0]!.sku, rows[0]!.warehouse].filter(Boolean).join(' · ')
              : `${rows.length} lines`}
          </div>
          {rows.length > 1 &&
            rows.map((r) => (
              <div key={`${r.sku}|${r.warehouse ?? ''}`} className="muted text-[10px]">
                {r.sku}
                {r.warehouse && ` · ${r.warehouse}`} — {num(r.quantity, 0)} {r.unit}
              </div>
            ))}
        </div>
      </div>
      <div className="effnums">
        <b>{totalOf(rows)}</b>
      </div>
    </div>
  );
}

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

  /**
   * Grade, then batch.
   *
   * A grade with no batch on any of its rows is one line rather than a heading
   * with a single unnamed thing under it - that is coarse, and the plant reads
   * it as a quantity rather than as a list.
   */
  const grades = useMemo(() => {
    const byGrade = new Map<string, Map<string, SapStockRow[]>>();
    for (const r of data?.rows ?? []) {
      const grade = r.grade ?? '';
      const batch = r.batch ?? '';
      const batches = byGrade.get(grade) ?? new Map<string, SapStockRow[]>();
      batches.set(batch, [...(batches.get(batch) ?? []), r]);
      byGrade.set(grade, batches);
    }
    return [...byGrade]
      .map(([grade, batches]) => ({
        grade,
        batches: [...batches]
          .map(([batch, rows]) => ({ batch, rows }))
          .sort((a, b) => (a.batch === '' ? 1 : b.batch === '' ? -1 : b.batch.localeCompare(a.batch))),
        rows: [...batches.values()].flat(),
      }))
      // An unmapped grade last: it is a thing to fix, not the headline.
      .sort((a, b) => (a.grade === '' ? 1 : b.grade === '' ? -1 : a.grade.localeCompare(b.grade)));
  }, [data]);

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

      {grades.map(({ grade, batches, rows }) => {
        /* Nothing batch-identified at all: coarse, and it clubs into one line. */
        const clubbed = batches.length === 1 && batches[0]!.batch === '';
        return (
          <div key={grade || 'unmapped'} className="effblock">
            <div className="effhead">
              <b>{grade || 'Not mapped to a grade'}</b>
              <span className="effnote">
                {totalOf(rows)}
                {!clubbed && ` · ${batches.length} batches`}
              </span>
            </div>

            {clubbed ? (
              <Batch label="Not batch-identified" rows={rows} />
            ) : (
              batches.map(({ batch, rows: batchRows }) => (
                <Batch
                  key={batch || 'no-batch'}
                  label={batch || 'No batch against it'}
                  rows={batchRows}
                />
              ))
            )}

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
