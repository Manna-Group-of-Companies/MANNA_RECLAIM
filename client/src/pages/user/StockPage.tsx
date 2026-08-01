import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import { Badge, Button, EmptyState, PageLoader, QualityChip, ViewHead } from '@/components/ui';
import { NewDispatchSheet, type DispatchableStock } from '@/features/dispatch/NewDispatchSheet';
import { ADMIN_ROLES } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import type { DispatchGrade, QcStatus, StockGroup, StockSummaryRow } from '@/types/models';

/**
 * The yard.
 *
 * One route, two screens, because a manager and a supervisor are not being
 * shown the same thing with a field hidden - they are calling different
 * endpoints. `/stock` carries what was packed, what has gone out and what is
 * left; `/stock/summary` carries the label, the grade, what is there and the
 * lab's verdict, and is built by its own serializer on the server. A supervisor
 * asking for `/stock` is refused at the route, so there is nothing here that
 * depends on this component being careful.
 *
 * The two responses are normalised into one card shape below rather than
 * rendered by two near-identical blocks. The manager's card carries an extra
 * line - what was packed and what has already gone - and that line is the only
 * difference between them, because it is the only field the supervisor's
 * response does not have.
 *
 * A group the lab has not passed stays on the list rather than disappearing
 * from it, with the reason next to it. The floor needs to know the stock exists
 * and why it cannot go anywhere; hiding it only produces a phone call.
 *
 * Both screens dispatch. Passing QC is the step before loading a vehicle and
 * the vehicle is loaded at the yard, so the button belongs on the side the yard
 * is standing on - a supervisor watching sacks go onto a lorry should not be
 * telephoning the office to have the movement recorded.
 */

const QC_TONE: Record<QcStatus, 'ok' | 'down' | 'paused'> = {
  pass: 'ok',
  fail: 'down',
  pending: 'paused',
};

const QC_LABEL: Record<QcStatus, string> = {
  pass: 'QC pass',
  fail: 'QC fail',
  pending: 'QC pending',
};

/** The verdict filter, in the order the yard cares about it. */
const QC_FILTERS: QcStatus[] = ['pass', 'pending', 'fail'];

/** Why this group cannot be loaded onto a vehicle, in the words to say it in. */
const blockedReason = (card: { qc: QcStatus; available: number }): string | null => {
  if (card.qc === 'fail') return 'Failed QC — cannot be dispatched';
  if (card.qc === 'pending') return 'Awaiting the lab — not released yet';
  if (card.available <= 0) return 'Nothing left in this group';
  return null;
};

/**
 * One card, from whichever response it came off. `ledger` is the back office's
 * extra line and is null on the supervisor's side - not blanked there, absent,
 * because the fields it is built from are not in their response at all.
 */
interface YardCard {
  id: string;
  label: string;
  grade: DispatchGrade | null;
  available: number;
  qc: QcStatus;
  kind: string | null;
  ledger: string | null;
}

const fromGroup = (row: StockGroup): YardCard => ({
  id: row.id,
  label: row.display_label,
  grade: row.quality,
  available: row.available_sacks,
  qc: row.qc_status,
  kind: [
    row.kind === 'pool' ? 'coarse pool' : 'batch',
    row.period_start ? `${row.period_start} → ${row.period_end}` : null,
  ]
    .filter(Boolean)
    .join(' · '),
  ledger: `${row.packed_sacks} packed · ${row.dispatched_sacks} dispatched`,
});

const fromSummary = (row: StockSummaryRow): YardCard => ({
  id: row.id,
  label: row.label,
  grade: row.quality,
  available: row.available_sacks,
  qc: row.qc_status,
  kind: null,
  ledger: null,
});

export function StockPage() {
  const notify = useToast();
  const role = useAppSelector((s) => s.auth.user?.role);
  const isManager = Boolean(role && ADMIN_ROLES.includes(role));

  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [summary, setSummary] = useState<StockSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState('');
  const [qc, setQc] = useState('');
  const [dispatching, setDispatching] = useState(false);
  /** The group the sheet should open on, when it was opened from a card. */
  const [dispatchFrom, setDispatchFrom] = useState<string | null>(null);

  const openDispatch = useCallback((stockGroupId: string | null) => {
    setDispatchFrom(stockGroupId);
    setDispatching(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isManager) setGroups((await stockService.list({ limit: 200 })).rows);
      else setSummary((await stockService.summary({ limit: 200 })).rows);
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [isManager, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(
    () => (isManager ? groups.map(fromGroup) : summary.map(fromSummary)),
    [isManager, groups, summary],
  );

  /*
   * Filtered here rather than refetched. The whole yard is a couple of hundred
   * rows at most, and a round trip per tap on a tablet over the plant's wifi is
   * slower than the crew can read.
   */
  const visible = useMemo(
    () => cards.filter((c) => (!grade || c.grade === grade) && (!qc || c.qc === qc)),
    [cards, grade, qc],
  );

  /* The grades actually in the yard, and how many groups of each - offering a
     grade with nothing under it is a dead option on a tablet. */
  const gradeCounts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const c of cards) if (c.grade) tally[c.grade] = (tally[c.grade] ?? 0) + 1;
    return tally;
  }, [cards]);

  const grades = useMemo<string[]>(
    () => Object.keys(gradeCounts).sort((a, b) => a.localeCompare(b)),
    [gradeCounts],
  );

  const qcCounts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const c of cards) tally[c.qc] = (tally[c.qc] ?? 0) + 1;
    return tally;
  }, [cards]);

  /* A filter left on a value the yard no longer holds shows an empty screen
     with no clue why, so it falls back to all rather than stranding the crew. */
  useEffect(() => {
    if (grade && !grades.includes(grade)) setGrade('');
  }, [grade, grades]);
  useEffect(() => {
    if (qc && !qcCounts[qc]) setQc('');
  }, [qc, qcCounts]);

  /*
   * What the dispatch sheet is offered. Built off the same normalised cards, so
   * the sheet can never be handed a group the screen is not showing.
   */
  const dispatchable: DispatchableStock[] = useMemo(
    () =>
      cards.map((c) => ({
        id: c.id,
        display_label: c.label,
        quality: c.grade,
        available_sacks: c.available,
        qc_status: c.qc,
      })),
    [cards],
  );

  const canDispatch = dispatchable.some((row) => row.available_sacks > 0 && row.qc_status === 'pass');

  const readySacks = cards.reduce((sum, c) => sum + (c.qc === 'pass' ? c.available : 0), 0);
  const heldSacks = cards.reduce((sum, c) => sum + (c.qc === 'pass' ? 0 : c.available), 0);
  const filtered = Boolean(grade || qc);

  if (loading && !cards.length) return <PageLoader label="Loading stock" />;

  const chip = (
    label: string,
    count: number,
    on: boolean,
    modifier: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={cn('gradebtn', modifier, on && 'on')}
      aria-pressed={on}
      onClick={onClick}
    >
      {label} <span className="n">{count}</span>
    </button>
  );

  return (
    <>
      <ViewHead
        title="Stock"
        meta={
          <>
            {filtered ? `${visible.length} of ${cards.length}` : cards.length} groups ·{' '}
            {readySacks} sacks ready{heldSacks > 0 ? ` · ${heldSacks} held` : ''}
          </>
        }
      />

      {!cards.length ? (
        <EmptyState
          icon={icons.packing}
          title="Nothing in the yard"
          hint="Bag a weighed run on the Packing tab and it is filed here as stock — coarse into the ten-day pool, everything else against its batch."
        />
      ) : (
        <>
          {/* One grade in the yard is not something to filter by. */}
          {grades.length > 1 && (
            <div className="gradebar" role="group" aria-label="Filter by quality">
              {chip('All', cards.length, !grade, 'all-grades', () => setGrade(''))}
              {grades.map((g) =>
                chip(g, gradeCounts[g] ?? 0, grade === g, `q-${g}`, () => setGrade(g)),
              )}
            </div>
          )}

          {/* The verdict filter only earns its row once the yard holds more
              than one verdict - otherwise every card is the same colour. */}
          {Object.keys(qcCounts).length > 1 && (
            <div className="gradebar" role="group" aria-label="Filter by QC status">
              {chip('All', cards.length, !qc, 'all-grades', () => setQc(''))}
              {QC_FILTERS.filter((status) => qcCounts[status]).map((status) =>
                chip(QC_LABEL[status], qcCounts[status] ?? 0, qc === status, `qc-${status}`, () =>
                  setQc(status),
                ),
              )}
            </div>
          )}

          {/* The cards each dispatch their own group; this is for a vehicle
              loaded off several at once, which has no card to start from. */}
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" onClick={() => openDispatch(null)} disabled={!canDispatch}>
              New dispatch ▸
            </Button>
          </div>

          {visible.length ? (
            <div className="stack">
              {visible.map((c) => {
                const reason = blockedReason(c);
                const loadable = c.qc === 'pass' && c.available > 0;
                return (
                  <article
                    key={c.id}
                    className={cn('scard', c.qc, c.available <= 0 && 'spent')}
                  >
                    <div className="top">
                      <div className="who">
                        <div className="row1">
                          <b>{c.label}</b>
                          {c.grade && <QualityChip quality={c.grade} />}
                        </div>
                        {c.kind && <small>{c.kind}</small>}
                        {c.ledger && <small>{c.ledger}</small>}
                      </div>
                      <div className="left">
                        <b>{c.available}</b>
                        <span>available</span>
                      </div>
                    </div>

                    <div className="foot">
                      <div>
                        <Badge tone={QC_TONE[c.qc]}>{QC_LABEL[c.qc]}</Badge>
                        {reason && <div className="why">{reason}</div>}
                      </div>
                      {loadable && (
                        <Button variant="primary" size="sm" onClick={() => openDispatch(c.id)}>
                          Dispatch ▸
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty">No stock matches those filters.</p>
          )}
        </>
      )}

      <NewDispatchSheet
        open={dispatching}
        groups={dispatchable}
        initialGroupId={dispatchFrom}
        onClose={() => setDispatching(false)}
        onPosted={() => void load()}
      />
    </>
  );
}

export default StockPage;
