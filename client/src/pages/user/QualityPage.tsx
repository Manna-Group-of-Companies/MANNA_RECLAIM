import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  attachReport,
  fetchPendingQuality,
  fetchQualitySummary,
  recordTest,
} from '@/features/quality/qualitySlice';
import { batchQc, batchQcChip, type BatchQc, type GradeStatus } from '@/features/quality/qc';
import {
  BatchRef,
  BottomSheet,
  Button,
  EmptyState,
  FieldRow,
  FormChip,
  PageLoader,
  Pick,
  QualityChip,
  SheetLabel,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import { QC_PARAM_SUGGEST, QC_REPORT_MAX_BYTES, SUPERVISORS } from '@/config/constants';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { currentShift, dayLong, dayMonth, lastNDays, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Batch, Quality, QualityParam, QualityTest, Verdict } from '@/types/models';

/**
 * The lab's tab. A batch is tested grade by grade - each one gets its own
 * readings, its own verdict and its own report - so the tab opens on the
 * batches, a batch opens on its grades, and a grade opens on the test itself.
 *
 * A hold does not block anything by itself: it flags the batch on Dispatch so
 * whoever is loading the vehicle has to make the call knowingly.
 */

/** The test being written up, until it is filed. */
interface Draft {
  batch: Batch;
  grade: Quality;
  params: QualityParam[];
  verdict: Verdict;
  testedBy: string;
  notes: string;
  /** A report already on file - kept unless a new file replaces it. */
  attachmentUrl: string;
  attachmentName: string;
  file: { name: string; type: string; dataUrl: string } | null;
}

const emptyEntry = { name: '', value: '', unit: '' };

/** When the batch went into the autoclave - how old the material is. */
const chargedText = (batch: Batch) => {
  const when = batch.opened_at ? dayMonth(batch.opened_at) : batch.shift_date ? dayLong(batch.shift_date) : null;
  return [batch.machine_id, when && `charged ${when}`].filter(Boolean).join(' · ');
};

const readings = (test: QualityTest) => {
  const count = test.params?.length ?? 0;
  return count ? `${count} reading${count > 1 ? 's' : ''}` : 'no readings';
};

const chipStyle = (tone: ReturnType<typeof batchQcChip>['tone']) =>
  tone === 'ok'
    ? { background: 'var(--ok)', color: 'var(--on-fill)' }
    : tone === 'part'
      ? { background: 'var(--pause)', color: 'var(--on-fill)' }
      : undefined;

/** "2 grades awaiting test", "All grades passed", "1 grade on hold". */
const batchHint = (qc: BatchQc) => {
  if (!qc.allDone) return `${qc.untested} grade${qc.untested > 1 ? 's' : ''} awaiting test`;
  if (qc.anyHold) return `${qc.hold} grade${qc.hold > 1 ? 's' : ''} on hold`;
  return 'All grades passed';
};

export function QualityPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { batches, pending, tests, summary, loading } = useAppSelector((s) => s.quality);
  // Whoever is signed in on this device is the default tester.
  const supervisor = useAppSelector((s) => s.auth.user?.name ?? '');

  /** The batch whose grades are listed, and the grade being written up. */
  const [target, setTarget] = useState<Batch | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [entry, setEntry] = useState(emptyEntry);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchPendingQuality());
    void dispatch(fetchQualitySummary(lastNDays(30)));
  }, [dispatch]);

  /** Newest batch first, each with where its grades stand. */
  const cards = useMemo(
    () =>
      [...batches]
        .sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? ''))
        .map((batch) => ({ batch, qc: batchQc(batch, tests) })),
    [batches, tests],
  );

  const openGrades = target ? (cards.find((c) => c.batch.id === target.id)?.qc ?? null) : null;

  const openGrade = (batch: Batch, status: GradeStatus) => {
    const prev = status.test;
    setEntry(emptyEntry);
    setDraft({
      batch,
      grade: status.grade,
      // A re-test starts from what was measured last time rather than blank.
      params: prev?.params ? prev.params.map((p) => ({ ...p })) : [],
      verdict: prev?.verdict ?? 'pass',
      testedBy: prev?.tested_by ?? prev?.tester ?? (supervisor || SUPERVISORS[0] || ''),
      notes: '',
      attachmentUrl: prev?.attachment_url ?? '',
      attachmentName: prev?.attachment_name ?? '',
      file: null,
    });
  };

  const addParam = () => {
    const name = entry.name.trim();
    const value = entry.value.trim();
    if (!name) return notify('Name the parameter', 'warn');
    if (!value) return notify('Enter the value', 'warn');
    setDraft((d) =>
      d ? { ...d, params: [...d.params, { name, value, unit: entry.unit.trim() || undefined }] } : d,
    );
    setEntry(emptyEntry);
  };

  const removeParam = (at: number) =>
    setDraft((d) => (d ? { ...d, params: d.params.filter((_, i) => i !== at) } : d));

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > QC_REPORT_MAX_BYTES) return notify('File too large (max 8 MB)', 'warn');
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((d) =>
        d ? { ...d, file: { name: file.name, type: file.type, dataUrl: String(reader.result) } } : d,
      );
    reader.onerror = () => notify('Could not read that file', 'err');
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!draft) return;
    const notes = draft.notes.trim();
    if (!draft.params.length && !notes && !draft.file && !draft.attachmentUrl) {
      notify('Add at least one test parameter for this grade', 'warn');
      return;
    }

    setSaving(true);
    const filed = await dispatch(
      recordTest({
        batchNo: draft.batch.ref,
        machineId: draft.batch.machine_id,
        grade: draft.grade,
        verdict: draft.verdict,
        params: draft.params,
        testedBy: draft.testedBy.trim() || supervisor || SUPERVISORS[0],
        shiftDate: todayISO(),
        shift: currentShift(),
        remarks: notes || null,
        // A new file replaces the old report; without one the old still stands.
        attachmentUrl: draft.file ? null : draft.attachmentUrl || null,
        attachmentName: draft.file ? null : draft.attachmentName || null,
      }),
    );

    if (!recordTest.fulfilled.match(filed)) {
      setSaving(false);
      notify(`Could not file the verdict for ${draft.grade}`, 'err');
      return;
    }

    let reportFailed = false;
    if (draft.file) {
      const uploaded = await dispatch(
        attachReport({ id: filed.payload.id, name: draft.file.name, dataUrl: draft.file.dataUrl }),
      );
      reportFailed = !attachReport.fulfilled.match(uploaded);
      if (!reportFailed) void dispatch(fetchPendingQuality());
    }
    setSaving(false);

    const verdict = draft.verdict === 'hold' ? 'held' : 'passed';
    notify(
      reportFailed
        ? `${draft.batch.ref} · ${draft.grade} ${verdict} — the report did not upload`
        : `${draft.batch.ref} · ${draft.grade} ${verdict}`,
      reportFailed || draft.verdict === 'hold' ? 'warn' : 'ok',
    );
    setDraft(null); // back to the batch's grades
  };

  if (loading && !batches.length && !tests.length) return <PageLoader label="Loading quality" />;

  return (
    <>
      <ViewHead title="Quality" meta={`${pending.length} awaiting test`} />

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

      {!cards.length ? (
        <EmptyState
          icon={icons.quality}
          title="Nothing to test yet"
          hint="Once a special batch is loaded it shows up here for you to log results, grade by grade."
        />
      ) : (
        <>
          <SheetLabel className="mx-0.5 mb-2 mt-1">
            Special batches <span className="muted normal-case tracking-normal">— pass / hold per grade</span>
          </SheetLabel>
          <div className="stack">
            {cards.map(({ batch, qc }) => {
              const chip = batchQcChip(qc);
              const charged = chargedText(batch);
              return (
                <button
                  key={batch.id}
                  type="button"
                  className="bcard w-full text-left"
                  onClick={() => setTarget(batch)}
                >
                  <div className="bhead">
                    <div className="l">
                      <BatchRef className="text-base">{batch.ref}</BatchRef>
                      {batch.formulation && <FormChip>{batch.formulation}</FormChip>}
                    </div>
                    <span
                      className={cn('qchip', chip.tone === 'hold' && 'hold', chip.tone === 'none' && 'shift')}
                      style={chipStyle(chip.tone)}
                    >
                      {chip.label}
                    </span>
                  </div>

                  <div className="bgrade">
                    {qc.grades.map((g) => (
                      <span
                        key={g.grade}
                        className={cn('gradetag', g.verdict === 'hold' ? 'hold' : g.verdict && 'pass')}
                      >
                        <i className="gd" />
                        {g.grade}
                      </span>
                    ))}
                  </div>

                  {charged && <div className="bhint mt-2">{charged}</div>}
                  <div className="bhint mt-0.5">{batchHint(qc)} · tap to log per-grade results</div>
                </button>
              );
            })}
          </div>
        </>
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
                {((test.params?.length ?? 0) > 0 || test.attachment_url) && (
                  <div className="mlog-b">
                    {test.params?.map((p) => (
                      <span key={p.name}>
                        <b>{p.name}</b> {p.value}
                        {p.unit ?? ''}{' '}
                      </span>
                    ))}
                    {test.attachment_url && (
                      <a
                        href={test.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--elec)' }}
                      >
                        report ✓
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* The batch: which of its grades have been tested, and which have not. */}
      <BottomSheet
        open={Boolean(target) && !draft}
        title={target ? `Batch ${target.ref}` : ''}
        subtitle={
          target
            ? [target.formulation, chargedText(target)]
                .filter(Boolean)
                .concat('Each grade is tested separately — tap a grade to log its own parameters and verdict.')
                .join(' · ')
            : undefined
        }
        led="var(--led-brand)"
        onClose={() => setTarget(null)}
        footer={
          <Button variant="ghost" onClick={() => setTarget(null)}>
            Close
          </Button>
        }
      >
        {target &&
          openGrades?.grades.map((status) => (
            <button
              key={status.grade}
              type="button"
              className="qcrow"
              onClick={() => openGrade(target, status)}
            >
              <QualityChip quality={status.grade} className="min-w-[78px] text-center" />
              <span className="flex-1">
                {status.test ? (
                  <>
                    <b style={{ color: status.verdict === 'hold' ? 'var(--err)' : 'var(--ok)' }}>
                      {status.verdict === 'hold' ? 'HOLD' : 'Passed'}
                    </b>
                    <span className="muted">
                      {' · '}
                      {dayMonth(status.test.tested_at)} · {readings(status.test)}
                    </span>
                  </>
                ) : (
                  <span className="muted">Untested</span>
                )}
              </span>
              <span className="chev">›</span>
            </button>
          ))}
      </BottomSheet>

      {/* One grade of that batch: its readings, its verdict, its report. */}
      <BottomSheet
        open={Boolean(draft)}
        title={draft ? `Batch ${draft.batch.ref} · ${draft.grade}` : ''}
        subtitle={
          draft
            ? [draft.batch.formulation, 'Log this grade’s test parameters, then mark Pass or Hold.']
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        led="var(--led-brand)"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save result
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <datalist id="qc-names">
              {QC_PARAM_SUGGEST.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            <SheetLabel>
              Test readings <span className="muted normal-case tracking-normal">— for this grade</span>
            </SheetLabel>
            {draft.params.length ? (
              draft.params.map((param, at) => (
                <div key={`${param.name}-${at}`} className="weighrow mb-2">
                  <span>
                    <b>{param.name}</b> · {param.value}
                    {param.unit ? ` ${param.unit}` : ''}
                  </span>
                  <button
                    type="button"
                    className="wdel"
                    aria-label={`Remove ${param.name}`}
                    onClick={() => removeParam(at)}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="hint my-1">No readings yet. Add each test parameter and its value.</div>
            )}

            <FieldRow className="mt-1.5 items-stretch">
              <TextField
                label="Parameter"
                list="qc-names"
                autoComplete="off"
                placeholder="e.g. Mooney viscosity"
                value={entry.name}
                onChange={(e) => setEntry({ ...entry, name: e.target.value })}
                fieldClassName="!mb-0 flex-[1.3]"
              />
              <TextField
                label="Value"
                inputMode="decimal"
                placeholder="0"
                value={entry.value}
                onChange={(e) => setEntry({ ...entry, value: e.target.value })}
                fieldClassName="!mb-0"
              />
              <TextField
                label="Unit"
                autoComplete="off"
                placeholder="opt."
                value={entry.unit}
                onChange={(e) => setEntry({ ...entry, unit: e.target.value })}
                fieldClassName="!mb-0 flex-[.7]"
              />
              <Button variant="elec" className="flex-none self-end" onClick={addParam}>
                + Add
              </Button>
            </FieldRow>

            <SheetLabel className="mt-4">Verdict</SheetLabel>
            <div className="mb-1.5 flex gap-2">
              <Pick
                className="flex-1"
                selected={draft.verdict !== 'hold'}
                onClick={() => setDraft({ ...draft, verdict: 'pass' })}
                title="Pass"
                sub="fit for dispatch"
              />
              <Pick
                className="flex-1"
                selected={draft.verdict === 'hold'}
                onClick={() => setDraft({ ...draft, verdict: 'hold' })}
                title="Hold"
                sub="unfit — warn dispatch"
              />
            </div>

            <FieldRow className="mt-2.5">
              <TextField
                label="Tested by"
                autoComplete="off"
                placeholder="QC name"
                value={draft.testedBy}
                onChange={(e) => setDraft({ ...draft, testedBy: e.target.value })}
              />
            </FieldRow>

            <TextAreaField
              label="Notes"
              note="opt."
              rows={2}
              placeholder="observations / reason for hold"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />

            <SheetLabel className="mt-1.5">
              Lab report <span className="muted normal-case tracking-normal">opt. — photo or PDF</span>
            </SheetLabel>
            {draft.file ? (
              <div className="weighrow">
                <span>
                  {draft.file.type.startsWith('image') && (
                    <img
                      src={draft.file.dataUrl}
                      alt=""
                      className="mr-2 inline-block h-8 w-8 rounded-md object-cover align-middle"
                    />
                  )}
                  {draft.file.name} <small className="muted">new</small>
                </span>
                <button
                  type="button"
                  className="wdel"
                  aria-label="Remove the report"
                  onClick={() => setDraft({ ...draft, file: null })}
                >
                  ✕
                </button>
              </div>
            ) : (
              draft.attachmentUrl && (
                <div className="weighrow">
                  <span>
                    Report:{' '}
                    <a
                      href={draft.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--elec)' }}
                    >
                      view
                    </a>{' '}
                    <small className="muted">{draft.attachmentName}</small>
                  </span>
                </div>
              )
            )}
            <label className="btn ghost block mt-1.5 cursor-pointer">
              {draft.file || draft.attachmentUrl ? 'Replace report' : 'Attach photo / PDF'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={pickFile}
              />
            </label>

            <div className="hint mt-2">
              A hold does not stop a dispatch — it flags the batch so whoever loads it decides
              deliberately.
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default QualityPage;
