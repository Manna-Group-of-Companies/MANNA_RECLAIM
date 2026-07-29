import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  fetchPendingQuality,
  fetchQualitySummary,
  recordTest,
} from '@/features/quality/qualitySlice';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FormChip,
  PageLoader,
  QualityChip,
  SheetLabel,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import { QC_PARAMS, QUALITIES, SUPERVISORS } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { currentShift, dayMonth, lastNDays, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Batch, Quality, Verdict } from '@/types/models';

/**
 * The lab's tab. A verdict is filed per grade on a batch: pass, or hold. A
 * hold does not block anything by itself - it flags the batch on Dispatch so
 * whoever is loading the vehicle has to make the call knowingly.
 */
export function QualityPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { pending, tests, summary, loading } = useAppSelector((s) => s.quality);
  const supervisor = useAppSelector((s) => s.ui.supervisor);

  const [target, setTarget] = useState<Batch | null>(null);
  const [verdicts, setVerdicts] = useState<Partial<Record<Quality, Verdict>>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchPendingQuality());
    void dispatch(fetchQualitySummary(lastNDays(30)));
  }, [dispatch]);

  const open = (batch: Batch) => {
    setTarget(batch);
    setVerdicts({});
    setValues({});
    setNotes('');
  };

  const save = async () => {
    if (!target) return;
    const filed = Object.entries(verdicts) as [Quality, Verdict][];
    if (!filed.length) {
      notify('Mark at least one grade pass or hold', 'warn');
      return;
    }
    const params = QC_PARAMS.map((p) => ({
      name: p.name,
      value: (values[p.name] ?? '').trim(),
      unit: p.unit,
    })).filter((p) => p.value);

    setSaving(true);
    const results = await Promise.all(
      filed.map(([grade, verdict]) =>
        dispatch(
          recordTest({
            batchNo: target.ref,
            grade,
            verdict,
            params,
            testedBy: supervisor || SUPERVISORS[0],
            shiftDate: todayISO(),
            shift: currentShift(),
            remarks: notes.trim() || null,
          }),
        ),
      ),
    );
    setSaving(false);

    const failed = results.filter((r) => r.meta.requestStatus !== 'fulfilled').length;
    if (failed) {
      notify(`${failed} of ${filed.length} verdicts could not be saved`, 'err');
      return;
    }
    notify(`${target.ref} · ${filed.length} verdict${filed.length > 1 ? 's' : ''} filed`, 'ok');
    setTarget(null);
  };

  if (loading && !pending.length && !tests.length) return <PageLoader label="Loading quality" />;

  return (
    <>
      <ViewHead title="Quality" meta={`${pending.length} awaiting`} />

      {summary.length > 0 && (
        <div className="panel mb-3">
          {summary.map((row) => (
            <div key={row.grade} className="wq">
              <QualityChip quality={row.grade} />
              <div className="wbar">
                <i
                  style={{
                    width: `${row.passRate}%`,
                    background: row.passRate >= 90 ? 'var(--ok)' : 'var(--warn)',
                  }}
                />
              </div>
              <span className="val">
                {row.passRate}% <span className="muted">/{row.total}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!pending.length ? (
        <EmptyState
          icon={icons.quality}
          title="Nothing awaiting a verdict"
          hint="Every open batch has been tested. New batches appear here as they are charged."
        />
      ) : (
        <div className="stack">
          {pending.map((batch) => (
            <div key={batch.id} className="wcard">
              <div className="info">
                <div className="row1">
                  <BatchRef>{batch.ref}</BatchRef>
                  {batch.formulation && <FormChip>{batch.formulation}</FormChip>}
                </div>
                <small>
                  {batch.machine_id ?? '--'} · charged {batch.shift_date ?? dayMonth(batch.opened_at)}
                </small>
              </div>
              <Button variant="elec" onClick={() => open(batch)}>
                Test ▸
              </Button>
            </div>
          ))}
        </div>
      )}

      {tests.length > 0 && (
        <>
          <div className="msec">
            <b>Recent verdicts</b>
            <div className="ln" />
          </div>
          <div className="panel">
            {tests.slice(0, 12).map((test) => (
              <div key={test.id} className="mlog">
                <div className="mlog-h">
                  <span>
                    <BatchRef>{test.batch_no ?? '--'}</BatchRef>{' '}
                    <span className={cn('gradetag', test.verdict === 'pass' ? 'pass' : 'hold')}>
                      <i className="gd" />
                      {test.grade} {test.verdict}
                    </span>
                  </span>
                  <span className="muted text-[11px]">{dayMonth(test.tested_at)}</span>
                </div>
                {(test.params?.length ?? 0) > 0 && (
                  <div className="mlog-b">
                    {test.params?.map((p) => (
                      <span key={p.name}>
                        <b>{p.name}</b> {p.value}
                        {p.unit ?? ''}{' '}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <BottomSheet
        open={Boolean(target)}
        title={target ? `QC — ${target.ref}` : ''}
        subtitle={target ? `${target.formulation ?? 'no formulation'} · ${target.machine_id ?? '--'}` : undefined}
        led="radial-gradient(circle at 35% 30%,#9fe0ea,var(--elec))"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              File verdict
            </Button>
          </>
        }
      >
        <SheetLabel>Verdict per grade</SheetLabel>
        {QUALITIES.map((grade) => (
          <div key={grade} className="qgrow">
            <QualityChip quality={grade} className="w-[86px] text-center" />
            {(['pass', 'hold'] as Verdict[]).map((v) => (
              <button
                key={v}
                type="button"
                className={cn('gbtn', v, verdicts[grade] === v && 'sel')}
                onClick={() =>
                  setVerdicts({ ...verdicts, [grade]: verdicts[grade] === v ? undefined : v })
                }
              >
                {v === 'pass' ? 'Pass' : 'Hold'}
              </button>
            ))}
          </div>
        ))}

        <SheetLabel>Measured values</SheetLabel>
        <div className="field-inline flex-wrap">
          {QC_PARAMS.map((param) => (
            <TextField
              key={param.name}
              label={param.name}
              inputMode="decimal"
              suffix={param.unit || undefined}
              placeholder="—"
              value={values[param.name] ?? ''}
              onChange={(e) => setValues({ ...values, [param.name]: e.target.value })}
              fieldClassName="min-w-[45%] flex-1 !mb-2"
            />
          ))}
        </div>

        <TextAreaField
          label="Notes"
          note="opt."
          rows={2}
          placeholder="Anything the plant should know"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="hint">
          A hold does not stop a dispatch — it flags the batch so whoever loads it decides
          deliberately.
        </div>
      </BottomSheet>
    </>
  );
}

export default QualityPage;
