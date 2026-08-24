import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addVarianceReason,
  fetchShiftEfficiency,
  fetchShiftOptions,
} from '@/features/reports/reportsSlice';
import { setBackOfficeDay, setBackOfficeShift } from '@/features/ui/uiSlice';
import { BottomSheet, PageLoader, ViewHead } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useSupervisor } from '@/hooks/useSupervisor';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { EfficiencyCard, EfficiencyMetric, Shift, VarianceReason } from '@/types/models';

/**
 * How the shift did, on the tablet, for the crew that worked it - and where the
 * reason for a miss is written.
 *
 * The plant pays an incentive on these figures, and both halves of that follow
 * from it. A target somebody is paid against and cannot see is not a target, so
 * the shift reads the same numbers the office reads. And the person who can say
 * why a belt was slipping is the person who was standing next to it, so the
 * reason is written here rather than typed by a manager two days later from
 * something they were told on the phone.
 *
 * What a reason is not is the last word. It is a request to discount a miss, and
 * the office signs it off - so the card says whether that has happened yet, and
 * an unapproved reason says "waiting" rather than looking settled.
 */

type AskTarget = { card: string; metric: EfficiencyMetric } | null;

/** Hit or miss, in the plainest words the screen has. */
function Verdict({ metric }: { metric: EfficiencyMetric }) {
  if (metric.ideal == null) return <span className="effnote">no target set</span>;
  if (metric.offTarget) return <span className="effmiss">off target</span>;
  return <span className="effhit">on target</span>;
}

/** What has been said about a miss, and whether the office has accepted it. */
function Recorded({ reason }: { reason: VarianceReason }) {
  return (
    <div className="effreason">
      <div>
        <span className="muted">{reason.entered_by || 'shift'}:</span> {reason.reason}
      </div>
      {reason.manager_note && (
        /*
         * The office's own words, kept visibly apart from the shift's. These
         * records are read back when an incentive is being argued over, and a
         * manager's sentence must never be mistakable for the supervisor's.
         */
        <div className="effmgr">
          <span className="muted">{reason.approved_by || 'office'} added:</span>{' '}
          {reason.manager_note}
        </div>
      )}
      {reason.approved_at ? (
        <span className="effhit">approved{reason.approved_by ? ` · ${reason.approved_by}` : ''}</span>
      ) : (
        <span className="effnote">waiting for the office</span>
      )}
    </div>
  );
}

function Row({
  metric,
  reasons,
  onAsk,
}: {
  metric: EfficiencyMetric;
  reasons: VarianceReason[];
  onAsk: () => void;
}) {
  const shown =
    metric.value == null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
  return (
    <div className={cn('effline', metric.offTarget && 'miss')}>
      <div className="effname">
        <div>
          {metric.label}
          {metric.span && <span className="effspan">{metric.span}</span>}
        </div>
        {reasons.map((r) => (
          <Recorded key={r.id} reason={r} />
        ))}
        {/*
          Only on a miss, and only where a reason can actually be filed against
          something - a figure with no benchmark has nothing to explain.
        */}
        {metric.offTarget && metric.parameter && !reasons.length && (
          <button type="button" className="effwhy" onClick={onAsk}>
            Why was this off target?
          </button>
        )}
      </div>
      <div className="effnums">
        <b>{shown}</b>
        {metric.ideal != null && (
          <span className="efftarget">
            target {metric.ideal}
            {/*
              Which way is good, said on the row. Two figures here can both sit
              above their target with only one of them in trouble - more kg per
              man-hour is better, more kWh per kg is worse - and a crew paid on
              these should never have to work out which is which.
            */}
            <span className="muted">
              {' '}
              · {metric.lowerIsBetter ? 'lower is better' : 'higher is better'}
            </span>
          </span>
        )}
        <Verdict metric={metric} />
      </div>
    </div>
  );
}

export function UserEfficiencyPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { name: signer } = useSupervisor();
  const { shifts, shiftEfficiency, loading, error } = useAppSelector((s) => s.reports);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  /*
   * The same day the rest of the app is reading, so a supervisor who picked a
   * shift on History finds it picked here too. Shared through the store rather
   * than kept per page - see BackOfficeDay for what that fixed.
   */
  const date = useAppSelector((s) => s.ui.backOfficeDay);
  const shift = useAppSelector((s) => s.ui.backOfficeShift);

  const [ask, setAsk] = useState<AskTarget>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchShiftOptions());
  }, [dispatch, refreshTick]);

  // Open on the newest shift on record if nothing has been picked anywhere yet.
  useEffect(() => {
    if (date || !shifts.length) return;
    const first = shifts[0];
    if (!first) return;
    dispatch(setBackOfficeDay(first.date));
    dispatch(setBackOfficeShift(first.shifts.includes('Day') ? 'Day' : (first.shifts[0] ?? 'Day')));
  }, [dispatch, shifts, date]);

  useEffect(() => {
    if (!date) return;
    void dispatch(fetchShiftEfficiency({ date, shift }));
  }, [dispatch, date, shift, refreshTick]);

  /** What has already been said about a figure on this shift. */
  const reasonsFor = (parameter?: string | null) =>
    (shiftEfficiency?.varianceReasons ?? []).filter((r) => parameter && r.parameter === parameter);

  const save = async () => {
    if (!ask || !date) return;
    if (!reason.trim()) {
      notify('Say what happened', 'warn');
      return;
    }
    setSaving(true);
    const result = await dispatch(
      addVarianceReason({
        date,
        shift,
        parameter: ask.metric.parameter ?? ask.metric.key,
        label: `${ask.card} · ${ask.metric.label}`,
        // Snapshotted onto the record rather than looked up later: a benchmark
        // raised next month must not rewrite what this shift was explaining.
        ideal: ask.metric.ideal ?? null,
        actual: ask.metric.value ?? null,
        reason: reason.trim(),
        enteredBy: signer || null,
      }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Sent to the office' : 'Could not save that', okay ? 'ok' : 'err');
    if (okay) {
      setAsk(null);
      setReason('');
      void dispatch(fetchShiftEfficiency({ date, shift }));
    }
  };

  /** Every card on the screen, with the heading it is read under. */
  const cards = useMemo(() => {
    const s = shiftEfficiency;
    if (!s) return [];
    return [
      ...(s.refiners ?? []).map((c) => ({ card: c, title: `Special line · ${c.quality}` })),
      ...(s.grinders ?? []).map((c) => ({ card: c, title: c.machine ?? 'Grinder' })),
      ...(s.coarse ?? []).map((c) => ({ card: c, title: c.label ?? 'Coarse line' })),
      ...(s.autoclaves ?? []).map((c) => ({ card: c, title: c.label ?? 'Autoclave' })),
      ...(s.yields ?? []).map((c) => ({ card: c, title: `Batch ${c.batch} · yield` })),
    ];
  }, [shiftEfficiency]);

  const missed = cards.reduce(
    (n, { card }) => n + card.metrics.filter((m) => m.offTarget).length,
    0,
  );
  const measured = cards.reduce(
    (n, { card }) => n + card.metrics.filter((m) => m.ideal != null).length,
    0,
  );
  /** Misses nobody has written a word about yet - what the shift still owes. */
  const unexplained = cards.reduce(
    (n, { card }) =>
      n +
      card.metrics.filter((m) => m.offTarget && m.parameter && !reasonsFor(m.parameter).length)
        .length,
    0,
  );

  const available = shifts.find((s) => s.date === date)?.shifts ?? [];

  const renderCard = (card: EfficiencyCard, title: string) => {
    const off = card.metrics.filter((m) => m.offTarget).length;
    return (
      <div key={card.key} className={cn('effblock', off > 0 && 'flag')}>
        <div className="effhead">
          <b>{title}</b>
          {off > 0 ? (
            <span className="effmiss">{off} off target</span>
          ) : (
            <span className="effhit">all on target</span>
          )}
        </div>
        {card.metrics.map((m) => (
          <Row
            key={m.key}
            metric={m}
            reasons={reasonsFor(m.parameter)}
            onAsk={() => {
              setReason('');
              setAsk({ card: title, metric: m });
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <ViewHead title="Efficiency" meta={date ? dayLong(date) : 'no data'} />

      <div className="panel">
        <div className="field">
          <label htmlFor="ue-day">Shift day</label>
          <select
            id="ue-day"
            value={date}
            onChange={(e) => dispatch(setBackOfficeDay(e.target.value))}
          >
            {shifts.length ? (
              shifts.map((s) => (
                <option key={s.date} value={s.date}>
                  {dayLong(s.date)}
                </option>
              ))
            ) : (
              <option value="">No data</option>
            )}
          </select>
        </div>

        <div className="chips">
          {(['Day', 'Night'] as Shift[]).map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', shift === s && 'on')}
              onClick={() => dispatch(setBackOfficeShift(s))}
            >
              {s} shift
              {available.length > 0 && !available.includes(s) && (
                <span className="muted font-normal"> ·no data</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="errbox">Couldn’t load the shift: {error}</div>}
      {loading && <PageLoader label="Working out the shift" />}

      {!loading && shiftEfficiency && (
        <>
          {/*
            The headline first, because it is the one the incentive turns on and
            the crew should not have to add the cards up themselves.
          */}
          <div className={cn('effsum', missed > 0 && 'flag')}>
            <b>{measured - missed}</b> of <b>{measured}</b> figures on target
            {unexplained > 0 && (
              <div className="effnote">
                {unexplained} still to explain — the office reads these
              </div>
            )}
          </div>

          {cards.length ? (
            cards.map(({ card, title }) => renderCard(card, title))
          ) : (
            <div className="empty">Nothing was logged on this shift.</div>
          )}
        </>
      )}

      <BottomSheet
        open={Boolean(ask)}
        title="Why was this off target?"
        subtitle={ask ? `${ask.card} · ${ask.metric.label}` : ''}
        onClose={() => setAsk(null)}
        footer={
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Sending…' : 'Send to the office'}
          </button>
        }
      >
        {ask && (
          <>
            <div className="sub">
              Made {ask.metric.value}
              {ask.metric.unit ? ` ${ask.metric.unit}` : ''} against a target of {ask.metric.ideal}.
            </div>
            <div className="field">
              <label htmlFor="ue-reason">What happened</label>
              <textarea
                id="ue-reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="belt slipping · waiting on crumb · machine down two hours…"
              />
            </div>
            <div className="sub">
              Signed as {signer || 'this account'}. The office reads it and signs it off; until then
              the card shows it as waiting.
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default UserEfficiencyPage;
