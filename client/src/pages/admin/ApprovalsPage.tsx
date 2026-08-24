import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { reportService } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { isReadOnly } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { dayLong, lastNDays } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { VarianceStatus, VarianceStatusItem } from '@/types/models';

/**
 * Whether the rule is actually running.
 *
 * The plant's rule is that a figure which missed its benchmark is explained by
 * the shift that worked it and signed off by the office. Both halves existed
 * before this screen and neither could be seen: a supervisor did not know what
 * they still owed, a manager did not know what was waiting on them, and nobody
 * could say whether any of it was happening.
 *
 * So every miss over a window is here in one of three states, oldest first,
 * because the oldest is the one nobody is going to remember. There is no
 * "rejected" - a sign-off that can be refused would need an appeal and a second
 * conversation, and what the plant asked for was an approval.
 *
 * One page, three readers. The supervisor sees what the shift owes on the
 * tablet's own Efficiency tab; the manager approves here; the managing director
 * reads the same page and cannot touch it.
 */

const WINDOWS = [7, 30, 90];

const STATES = [
  {
    key: 'unexplained' as const,
    title: 'Waiting on the shift',
    blurb: 'Missed its benchmark and nobody has said why. The supervisor writes this on the tablet.',
  },
  {
    key: 'waiting' as const,
    title: 'Waiting on the office',
    blurb: 'The shift has explained it. Somebody here has to sign it off.',
  },
  {
    key: 'approved' as const,
    title: 'Approved',
    blurb: 'Explained and signed off.',
  },
];

export function ApprovalsPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const readOnly = isReadOnly(useAppSelector((s) => s.auth.user?.role));

  const [days, setDays] = useState(30);
  const [status, setStatus] = useState<VarianceStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<VarianceStatusItem | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await reportService.varianceStatus(lastNDays(days)));
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const approve = async () => {
    if (!approving?.reasonId) return;
    setSaving(true);
    try {
      await reportService.approveVarianceReason(approving.reasonId, managerNote.trim() || null);
      notify('Reason approved', 'ok');
      setApproving(null);
      setManagerNote('');
      await load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const totals = status?.totals;
  /*
   * How much of the window has been seen through to the end. Of the misses, not
   * of the shifts - a month with two misses both approved is a month in hand,
   * and a month with two hundred is not, whatever share of it has been signed.
   */
  const done = totals?.misses ? Math.round((totals.approved / totals.misses) * 100) : null;

  return (
    <>
      <div className="panel">
        <div className="chips">
          {WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              className={cn('chip', days === d && 'on')}
              onClick={() => setDays(d)}
            >
              Last {d} days
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{totals?.misses ?? 0}</b>
            <span>figures off target</span>
          </div>
          <div className="kpi">
            <b style={totals?.unexplained ? { color: 'var(--err)' } : undefined}>
              {totals?.unexplained ?? 0}
            </b>
            <span>waiting on the shift</span>
          </div>
          <div className="kpi">
            <b style={totals?.waiting ? { color: 'var(--warn)' } : undefined}>
              {totals?.waiting ?? 0}
            </b>
            <span>waiting on the office</span>
          </div>
          <div className="kpi">
            <b>{done == null ? '—' : `${done}%`}</b>
            <span>seen through</span>
          </div>
        </div>

        <div className="sub mt-2">
          A figure that missed its benchmark is explained by the shift that worked it and signed off
          here. Oldest first, because the oldest is the one nobody is going to remember.
        </div>
      </div>

      {error && <div className="errbox">Couldn’t load the approvals: {error}</div>}
      {loading && <div className="spin">Working out the window…</div>}

      {!loading &&
        status &&
        STATES.map(({ key, title, blurb }) => {
          const items = status.items.filter((i) => i.state === key);
          if (!items.length) return null;
          /*
           * Oldest first where somebody still owes something, newest first where
           * it is done: a queue is worked from the front, a record is read from
           * the back.
           */
          const ordered =
            key === 'approved' ? items : [...items].reverse();
          return (
            <div key={key}>
              <div className="grouphead">
                {title} · {items.length}
              </div>
              <div className="sub mb-2">{blurb}</div>
              {ordered.map((item) => (
                <div
                  key={`${item.date}|${item.shift}|${item.parameter}`}
                  className={cn('effcard', key === 'unexplained' && 'flag')}
                >
                  <div className="row">
                    <div>
                      <b>{item.label}</b>
                      <div className="muted text-[11px]">
                        {dayLong(item.date)}
                        {item.shift ? ` · ${item.shift} shift` : ' · whole day'}
                      </div>
                    </div>
                    <div className="cardaside">
                      <div>
                        made <b>{item.actual}</b> against {item.ideal}
                      </div>
                    </div>
                  </div>

                  {item.reason && (
                    <div className="reasons">
                      <div>
                        <span className="muted">{item.enteredBy || 'the shift'}:</span>{' '}
                        {item.reason}
                      </div>
                      {item.managerNote && (
                        <div className="mgrnote">
                          <span className="muted">{item.approvedBy || 'office'} added:</span>{' '}
                          {item.managerNote}
                        </div>
                      )}
                    </div>
                  )}

                  {key === 'waiting' && !readOnly && (
                    <button
                      type="button"
                      className="btn ghost block mt-2.5"
                      onClick={() => {
                        setManagerNote('');
                        setApproving(item);
                      }}
                    >
                      ✓ Approve this reason
                    </button>
                  )}
                  {key === 'approved' && (
                    <span className="okpill">
                      approved{item.approvedBy ? ` · ${item.approvedBy}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}

      {!loading && status && !status.items.length && (
        <div className="empty">Nothing missed its benchmark in this window.</div>
      )}

      <BoModal
        open={Boolean(approving)}
        title="Approve this reason"
        subtitle={approving?.label ?? ''}
        onClose={() => setApproving(null)}
        footer={
          <button type="button" className="btn" onClick={approve} disabled={saving}>
            {saving ? 'Saving…' : 'Approve'}
          </button>
        }
      >
        {approving && (
          <>
            <div className="calc">
              <div>
                <b>{approving.enteredBy || 'The shift'} said:</b> {approving.reason}
              </div>
              <div className="muted">
                ideal {approving.ideal ?? '—'} · actual {approving.actual ?? '—'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="ap-note">Anything to add? (optional)</label>
              <textarea
                id="ap-note"
                rows={3}
                value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
                placeholder="agreed, the feed was short all week…"
              />
            </div>
            <div className="sub">
              Your note is kept beside the shift’s words, not over them. Approving cannot be undone —
              if it was given in error, say so in the note.
            </div>
          </>
        )}
      </BoModal>
    </>
  );
}

export default ApprovalsPage;
