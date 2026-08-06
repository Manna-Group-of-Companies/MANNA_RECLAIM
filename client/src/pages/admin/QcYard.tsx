import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { stockService } from '@/api/services/stock.service';
import { toRequestError } from '@/api/axiosClient';
import { counted } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { dayMonth } from '@/utils/date';
import { kg as asKg } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { QcStatus, StockGroup, StockKind } from '@/types/models';

/**
 * QC - what is standing in the yard, and whether it may be sold.
 *
 * The Quality tab's second view rather than a tab of its own, because it is the
 * same question from the other end and a manager arrives at it having just
 * looked at the lab record. Its own file only because it is a screen's worth of
 * work; AdminQualityPage switches between the two.
 *
 * The verdict a dispatch reads is not on a test row; it is on the stock group,
 * because post_dispatch() refuses any line whose group is not `pass` and it has
 * no test to consult. Nearly always that verdict arrives from the bench: the lab
 * files a test on the shop-floor Quality tab and it is pushed onto the goods it
 * addresses. This page is the other door to the same field - PATCH /stock/:id/qc
 * - and until now nothing in the app opened it.
 *
 * It is not a second Quality tab. Quality is the lab record: who tested what,
 * with which readings, and how each grade is passing. This is the yard: every
 * group that exists, what it holds, and where it stands with the lab. A group
 * appears here that appears nowhere on Quality - a coarse pool nobody sampled, a
 * pack of loops with no lot behind it - and that is the point of having it,
 * because a group with no test is exactly the one that is stuck.
 *
 * Three things it is for, in the order they come up:
 *
 *   releasing    goods the bench cannot reach. A moulded group opens `pending`
 *                and is unsellable until something passes it.
 *   overriding   a verdict the office has decided differently about. Legitimate,
 *                and recorded as `manual` so the yard card can say the lab's
 *                reading was overruled rather than quietly showing it.
 *   finding      groups whose verdict and whose test do not agree - the QC sync
 *                cases. They are listed with the disagreement named.
 *
 * Every change is two-step. What this writes decides whether a lorry may be
 * loaded, and there is no undo behind it.
 */

/** What the verdict means, spelled out where a badge alone would not do. */
const QC_WORD: Record<QcStatus, string> = {
  pass: 'released — may be dispatched',
  fail: 'held — dispatch is refused',
  pending: 'awaiting the lab — dispatch is refused',
};

const QC_BADGE: Record<QcStatus, string> = { pass: 'ok', fail: 'hot', pending: 'none' };

const QC_LABEL: Record<QcStatus, string> = { pass: 'Pass', fail: 'Hold', pending: 'Pending' };

/** The four ways the plant makes something, as the yard keys it. */
const KIND_WORD: Record<StockKind, string> = {
  batch: 'batch',
  pool: 'coarse pool',
  product: 'moulded',
  lot: 'lot',
};

/**
 * What the group is called on screen.
 *
 * `label` is a key - `LOOP-50`, `2026-08-H1` - and `display_label` is the one
 * the yard reads. A batch-identified group says its number beside it, because
 * that is what a person on the floor is holding.
 */
const nameOf = (group: StockGroup) => group.display_label || group.label;

/** The grade, or the product on a moulded group. Never both - it is one field. */
const gradeOf = (group: StockGroup) => group.quality ?? group.product_id ?? '—';

/** "40 sacks of 60", so the split between sold and standing is on the row. */
const heldLine = (group: StockGroup) =>
  `${counted(group.available_qty ?? group.available_sacks ?? 0, group.unit)} of ${
    group.packed_qty ?? group.packed_sacks ?? 0
  } packed`;

/** Who put it on this verdict and when, where anyone did. */
const signedLine = (group: StockGroup) => {
  if (!group.qc_by && !group.qc_at) return null;
  return [
    group.qc_by,
    group.qc_at ? dayMonth(group.qc_at.slice(0, 10)) : null,
    group.qc_source === 'manual' ? 'by hand' : group.qc_source === 'lab' ? 'from the bench' : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** A lab verdict of `hold` is a fail on the goods - the two vocabularies meet here. */
const verdictStatus = (verdict?: string | null): QcStatus | null =>
  verdict === 'hold' ? 'fail' : verdict === 'pass' ? 'pass' : null;

/**
 * When the group's verdict and the test underneath it disagree, and why.
 *
 * The same three cases the shop floor's Stock card names, said here because this
 * is the page that can fix two of them. A row where the yard simply has not
 * picked the verdict up is not somebody's decision and does not read as one.
 */
const disagreement = (group: StockGroup): string | null => {
  const said = verdictStatus(group.lab_test?.verdict);
  if (!said || said === group.qc_status) return null;
  if (group.qc_status === 'pending') return 'the lab has ruled — the yard has not picked it up';
  return said === 'fail' ? 'the lab held this — released by hand since' : 'the lab passed this — held by hand since';
};

/** A verdict standing on nothing measured. Ordinary on a pool, notable elsewhere. */
const unbacked = (group: StockGroup) =>
  !group.lab_test && group.qc_status !== 'pending' && group.kind !== 'pool';

export function QcYard() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<'' | QcStatus>('');
  const [kind, setKind] = useState<'' | StockKind>('');
  /** Empty groups are the long tail of this list and nothing to release. */
  const [emptyToo, setEmptyToo] = useState(false);

  /**
   * The group armed for a change, and what it is being changed to.
   *
   * One at a time, so arming a second row disarms the first - the same two-step
   * the run and the test delete use. Releasing goods is not a single tap.
   */
  const [arming, setArming] = useState<{ id: string; to: QcStatus } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The whole yard. It is a few hundred rows at most and every filter on
      // this page is applied here rather than at the API, so a group cannot be
      // hidden by a query the screen has forgotten it sent.
      const { rows } = await stockService.list({ limit: 500 });
      setGroups(rows);
      setError(null);
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const rows = useMemo(
    () =>
      groups
        .filter((g) => (!status || g.qc_status === status) && (!kind || g.kind === kind))
        .filter((g) => emptyToo || (g.available_qty ?? g.available_sacks ?? 0) > 0)
        .sort(
          (a, b) =>
            // What is stuck first: pending, then held, then released. Within
            // each, the newest packing, because that is what is being asked about.
            order(a.qc_status) - order(b.qc_status) ||
            (b.last_packed_on ?? '').localeCompare(a.last_packed_on ?? '') ||
            nameOf(a).localeCompare(nameOf(b)),
        ),
    [groups, status, kind, emptyToo],
  );

  const totals = useMemo(() => {
    const live = groups.filter((g) => (g.available_qty ?? g.available_sacks ?? 0) > 0);
    return {
      groups: live.length,
      pending: live.filter((g) => g.qc_status === 'pending').length,
      held: live.filter((g) => g.qc_status === 'fail').length,
      /* What is actually sellable, in kg - the one figure that covers sacks and
         pieces together, and what a lorry is loaded by. */
      releasedKg: live
        .filter((g) => g.qc_status === 'pass')
        .reduce((sum, g) => sum + (g.available_kg ?? 0), 0),
      disagreeing: live.filter((g) => disagreement(g)).length,
    };
  }, [groups]);

  /**
   * Write the verdict, and put the answer back on the row.
   *
   * The server's row replaces the local one rather than the status being patched
   * in: `qc_by`, `qc_at` and `qc_source` are all set by this write, and a screen
   * that showed the new verdict over the old signature would be saying the bench
   * released something the office just did.
   */
  const setQc = async (group: StockGroup, to: QcStatus) => {
    setSaving(group.id);
    try {
      const updated = await stockService.setQcStatus(group.id, to);
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, ...updated } : g)));
      notify(`${nameOf(group)} · ${QC_WORD[to]}`, to === 'pass' ? 'ok' : 'warn');
      setArming(null);
    } catch (err) {
      notify(toRequestError(err).message || `Could not change the verdict on ${nameOf(group)}`, 'err');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="panel">
        <div className="row">
          <div>
            <h1 className="text-lg">QC · the yard</h1>
            <div className="sub">
              Every group standing in the plant and whether it may be sold. A dispatch is refused on
              anything that is not passed, so this is the door between packed stock and a vehicle.
            </div>
          </div>
        </div>

        <div className="filters">
          <div className="f">
            <label htmlFor="qc-status">Verdict</label>
            <select
              id="qc-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | QcStatus)}
            >
              <option value="">All verdicts</option>
              <option value="pending">Awaiting the lab</option>
              <option value="fail">Held</option>
              <option value="pass">Released</option>
            </select>
          </div>
          <div className="f">
            <label htmlFor="qc-kind">Kind</label>
            <select id="qc-kind" value={kind} onChange={(e) => setKind(e.target.value as '' | StockKind)}>
              <option value="">Everything</option>
              <option value="batch">Batches</option>
              <option value="pool">Coarse pools</option>
              <option value="product">Moulded</option>
              <option value="lot">Lots</option>
            </select>
          </div>
          <div className="f">
            <label htmlFor="qc-empty">Emptied groups</label>
            <select
              id="qc-empty"
              value={emptyToo ? 'y' : 'n'}
              onChange={(e) => setEmptyToo(e.target.value === 'y')}
            >
              <option value="n">Hide — nothing left to release</option>
              <option value="y">Show them too</option>
            </select>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{totals.groups}</b>
            <span>groups in the yard</span>
          </div>
          <div className="kpi">
            <b style={totals.pending ? { color: 'var(--amber)' } : undefined}>{totals.pending}</b>
            <span>awaiting the lab</span>
          </div>
          <div className="kpi">
            <b style={totals.held ? { color: 'var(--err)' } : undefined}>{totals.held}</b>
            <span>held</span>
          </div>
          <div className="kpi">
            <b>{totals.releasedKg ? asKg(totals.releasedKg) : '—'}</b>
            <span>released for sale</span>
          </div>
        </div>

        {/* Said on the page rather than only on the row it affects: a
            disagreement between the yard and the bench is the thing somebody
            opening this page most needs to be told exists. */}
        {totals.disagreeing > 0 && (
          <div className="sub mt-3">
            {totals.disagreeing} {totals.disagreeing === 1 ? 'group does' : 'groups do'} not agree with
            the lab test behind {totals.disagreeing === 1 ? 'it' : 'them'} — each one says so on its row.
          </div>
        )}
      </div>

      {error && <div className="errbox">{error}</div>}
      {loading && !groups.length && <div className="spin">Loading the yard…</div>}

      <div className="grouphead">
        Stock groups
        <span className="muted ml-2 text-[11px] font-normal">{rows.length} listed</span>
      </div>

      {!rows.length && !loading ? (
        <div className="empty">Nothing in the yard matches these filters.</div>
      ) : (
        rows.map((group) => {
          const armed = arming?.id === group.id ? arming.to : null;
          const busy = saving === group.id;
          const note = disagreement(group);

          return (
            <div key={group.id} className="runcard">
              <div className="top">
                <span className="ttl">
                  <span className="batchref">{nameOf(group)}</span>{' '}
                  <span className="qchip">{gradeOf(group)}</span>{' '}
                  <span className={`badge ${QC_BADGE[group.qc_status]}`}>
                    {QC_LABEL[group.qc_status]}
                  </span>
                </span>
                <span className="when">
                  {KIND_WORD[group.kind]}
                  {group.batch_no ? ` · ${group.batch_no}` : ''}
                </span>
              </div>

              <div className="sub mt-1">
                {heldLine(group)}
                {group.available_kg ? ` · ${asKg(group.available_kg)}` : ''}
                {group.last_packed_on ? ` · packed to ${dayMonth(group.last_packed_on)}` : ''}
              </div>

              <div className="sub mt-1">
                {group.lab_test
                  ? `lab: ${group.lab_test.verdict ?? 'no verdict'}${
                      group.lab_test.tested_by ? ` · ${group.lab_test.tested_by}` : ''
                    }${
                      group.lab_test.tested_at
                        ? ` · ${dayMonth(group.lab_test.tested_at.slice(0, 10))}`
                        : ''
                    }`
                  : 'no test on file'}
                {signedLine(group) ? ` · signed ${signedLine(group)}` : ''}
              </div>

              {note && <div className="sub mt-1" style={{ color: 'var(--amber)' }}>{note}</div>}
              {unbacked(group) && !note && (
                <div className="sub mt-1" style={{ color: 'var(--ink-faint)' }}>
                  this verdict has no test under it
                </div>
              )}

              <div className="row mt-2 items-center justify-between gap-2">
                <span className="muted text-[11px]">{QC_WORD[group.qc_status]}</span>
                <span className="flex items-center gap-1.5">
                  {(['pass', 'fail', 'pending'] as QcStatus[]).map((to) => (
                    <button
                      key={to}
                      type="button"
                      className={cn('btn', to === 'fail' && 'danger')}
                      disabled={to === group.qc_status || busy}
                      onClick={() => setArming({ id: group.id, to })}
                    >
                      {QC_LABEL[to]}
                    </button>
                  ))}
                </span>
              </div>

              {/* The consequence spelled out beside the armed button, not left
                  to the toast afterwards. What this moves is whether a lorry may
                  be loaded, and that is the part a desk is least likely to have
                  in mind. */}
              {armed && (
                <div className="mt-2">
                  <div className="sub">
                    {armed === 'pass'
                      ? `Releasing ${nameOf(group)} lets ${heldLine(group).split(' of ')[0]} go out on a vehicle.`
                      : armed === 'fail'
                        ? `Holding ${nameOf(group)} refuses every dispatch off it until it is released again.`
                        : `Putting ${nameOf(group)} back to pending refuses every dispatch off it until it is tested or released.`}
                    {group.lab_test && verdictStatus(group.lab_test.verdict) !== armed
                      ? ' This overrules the lab test on file, and the yard card will say so.'
                      : ''}
                  </div>
                  <div className="row mt-2 items-center gap-1.5">
                    <button
                      type="button"
                      className={cn('btn', armed === 'pass' ? 'primary' : 'danger')}
                      onClick={() => void setQc(group, armed)}
                      disabled={busy}
                    >
                      {busy ? 'Saving…' : `Yes, set ${QC_LABEL[armed].toLowerCase()}`}
                    </button>
                    <button type="button" className="btn" onClick={() => setArming(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

/** Stuck first: pending, then held, then released. */
function order(status: QcStatus) {
  return status === 'pending' ? 0 : status === 'fail' ? 1 : 2;
}

export default QcYard;
