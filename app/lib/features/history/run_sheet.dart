import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../services/services.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/sheet.dart';
import '../../widgets/ui.dart';
import 'run_draft.dart';

/// What the sheet did, so the list behind it can follow without refetching.
class RunSheetResult {
  const RunSheetResult({this.saved, this.deletedId});
  final Run? saved;
  final String? deletedId;
}

/// The Edit entry sheet: the run opens straight into its own form, with
/// everything that is not editable read out underneath it.
///
/// The fields on offer follow what was actually recorded. A shiftwise run - the
/// grinding and coarse lines, measured by the shift rather than by the batch -
/// has no batch or grade to correct, so it is not asked for one; an autoclave
/// is timed by its charge rather than by a meter, so it gets neither meter
/// group; a press records no meters and no hours at all.
///
/// Both writes rewrite the plant's record, so the sheet is what stands in for
/// the role check the API used to make: what a reading works out to is shown
/// under it before it is saved, and the delete names the entry it is about to
/// remove and waits to be told again.
///
/// A port of the RunSheet in client/src/pages/user/HistoryPage.tsx.
Future<RunSheetResult?> showRunSheet({
  required BuildContext context,
  required Run run,
}) async {
  final ui = context.read<UiStore>();
  final runService = context.read<RunService>();
  final machine = context.read<MachinesStore>().byId(run.machineId);

  final base = Draft(run);
  final draft = Draft(run);

  // The controllers. Held one per field so the sheet can redraw its arithmetic
  // on every keystroke without the text jumping.
  final c = <String, TextEditingController>{
    for (final entry in draft.fields.entries)
      entry.key: TextEditingController(text: entry.value),
  };

  void sync() {
    draft
      ..batchNo = c['batchNo']!.text
      ..formulation = c['formulation']!.text
      ..supervisor = c['supervisor']!.text
      ..workers = c['workers']!.text
      ..elecStart = c['elecStart']!.text
      ..elecEnd = c['elecEnd']!.text
      ..kwh = c['kwh']!.text
      ..hourStart = c['hourStart']!.text
      ..hourEnd = c['hourEnd']!.text
      ..hoursRun = c['hoursRun']!.text
      ..outWeight = c['outWeight']!.text
      ..firewoodKg = c['firewoodKg']!.text
      ..capacity = c['capacity']!.text
      ..packedSacks = c['packedSacks']!.text
      ..remarks = c['remarks']!.text
      ..pieces = c['pieces']!.text
      ..flashKg = c['flashKg']!.text
      ..cavities = c['cavities']!.text
      ..cyclicMin = c['cyclicMin']!.text
      ..pickingLabourers = c['pickingLabourers']!.text
      ..pickingHours = c['pickingHours']!.text;
  }

  var busy = false;
  String? error;

  // The title wears the short name the tablets label the machine with; the full
  // name and the id are read out under Full record.
  final label = machine?.short ?? run.machine ?? run.machineId;
  final when =
      '${dayMonth(run.shiftDate)}${run.shift.isNotEmpty ? ' · ${run.shift}' : ''}';

  // Shiftwise: the lines whose output is measured by the shift rather than by
  // the batch, so there is no batch or grade against the run to correct.
  final isShiftwise = run.line == 'grind' || run.line == 'coarse';
  final hasBatchFields =
      !isShiftwise || run.batchNo != null || run.quality != null;

  final result = await showAppSheet<RunSheetResult>(
    context: context,
    title: 'Edit entry — $label',
    subtitle: '$when · synced',
    led: T.elec,
    body: (context, setSheetState) {
      sync();
      final math = runMath(run, draft);

      Widget number(
        String field,
        String label, {
        String? note,
        String? suffix,
        bool enabled = true,
      }) => TextFieldRow(
        controller: c[field]!,
        label: label,
        note: note,
        suffix: suffix,
        decimal: true,
        enabled: enabled,
        placeholder: '—',
        onChanged: (_) => setSheetState(() {}),
      );

      // Run time is edited in minutes, the way the sheet asks for it; kept in
      // hours. A complete hour-meter pair is the authority, so the box goes
      // read-only rather than fighting the readings.
      final runtimeField = TextFieldRow(
        controller: c['hoursRun']!,
        label: 'Run time',
        note: math.hourPair ? '(hrs) — from the meter pair' : '(hrs)',
        decimal: true,
        enabled: !math.hourPair,
        placeholder: math.hourPair ? numText(math.hourDelta) : '—',
        onChanged: (_) => setSheetState(() {}),
      );

      final tyre = run.tyreType != null ? tyres[run.tyreType] : null;

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasBatchFields) ...[
            TextFieldRow(
              controller: c['batchNo']!,
              label: isShiftwise ? 'Coarse batch number' : 'Batch number',
              onChanged: (_) => setSheetState(() {}),
            ),
            // A press moulds finished goods, not a grade of reclaim: it has
            // neither a quality nor a formulation to correct.
            if (!math.isPress) ...[
              SelectFieldRow<String>(
                label: 'Quality',
                value: draft.quality,
                items: [
                  (value: '', label: '—'),
                  for (final q in qualities) (value: q, label: q),
                ],
                onChanged: (v) =>
                    setSheetState(() => draft.quality = v ?? ''),
              ),
              TextFieldRow(
                controller: c['formulation']!,
                label: 'Formulation',
                onChanged: (_) => setSheetState(() {}),
              ),
            ],
          ],

          const SheetLabel('Shift'),
          FieldRow(
            left: SelectFieldRow<String>(
              label: 'Shift',
              value: draft.shift.isEmpty ? null : draft.shift,
              items: [for (final s in shifts) (value: s, label: s)],
              onChanged: (v) => setSheetState(() => draft.shift = v ?? ''),
            ),
            right: DateFieldRow(
              label: 'Shift date',
              value: draft.shiftDate,
              onChanged: (v) => setSheetState(() => draft.shiftDate = v),
            ),
          ),
          TextFieldRow(
            controller: c['supervisor']!,
            label: 'Supervisor',
            onChanged: (_) => setSheetState(() {}),
          ),

          if (math.isAuto) ...[
            const SheetLabel('Charge'),
            FieldRow(left: runtimeField, right: number('workers', 'Workers')),
            number('capacity', 'Charge', note: '(kg)', suffix: 'kg'),
            number('firewoodKg', 'Firewood', note: '(kg)', suffix: 'kg'),
          ] else if (math.isPress) ...[
            // A press: what came out of the mould, and what it was moulded at.
            // No meters and no energy - it records neither. Material re-costs
            // itself off the weight, the flash and the count, at the rate the
            // run was moulded under.
            const SheetLabel('Moulded'),
            FieldRow(
              left: number('pieces', 'How many', note: '(nos)'),
              right: number('workers', 'Workers'),
            ),
            FieldRow(
              left: number('outWeight', 'Weight', note: '(kg)', suffix: 'kg'),
              right: number('flashKg', 'Flash', note: '(kg)', suffix: 'kg'),
            ),
            FieldRow(
              left: number('cyclicMin', 'Cyclic time', note: '(min)'),
              right: number('cavities', 'Cavities'),
            ),
            DiffOut(
              math.material == null
                  ? 'No compound rate against this run, so it carries no '
                        'material cost.'
                  : 'Material: ${draft.outWeight.isEmpty ? 0 : draft.outWeight}'
                        ' + ${draft.flashKg.isEmpty ? 0 : draft.flashKg} kg × '
                        '₹${run.compoundRate} = ₹${math.material}'
                        '${math.perPiece != null ? ' · ₹${math.perPiece} a piece' : ''}',
            ),
          ] else ...[
            const SheetLabel('Hour meter'),
            number('hourStart', 'Start reading', suffix: 'hrs'),
            number('hourEnd', 'Stop reading', suffix: 'hrs'),
            if (math.hourDelta != null)
              DiffOut(
                math.hourDelta! < 0
                    ? 'The hour meter reads lower at the stop than at the '
                          'start.'
                    : 'Run: ${draft.hourEnd} − ${draft.hourStart} = '
                          '${math.hourDelta} hrs',
                bad: math.hourDelta! < 0,
              ),
            FieldRow(left: runtimeField, right: number('workers', 'Workers')),

            const SheetLabel('Electricity meter'),
            number('elecStart', 'Start reading', suffix: 'units'),
            number('elecEnd', 'Final reading', suffix: 'units'),
            if (math.elecDelta != null)
              DiffOut(
                math.elecDelta! < 0
                    ? 'The electricity meter reads lower at the end than at '
                          'the start.'
                    : 'Consumed: ${draft.elecEnd} − ${draft.elecStart} = '
                          '${math.elecDelta} units',
                bad: math.elecDelta! < 0,
              ),
            TextFieldRow(
              controller: c['kwh']!,
              label: 'Energy',
              note: '(kWh) — recalculated when a reading changes',
              decimal: true,
              enabled: !math.elecPair,
              placeholder: math.elecPair ? numText(math.energy) : '—',
              onChanged: (_) => setSheetState(() {}),
            ),
          ],

          // A press has already been asked for its weight above, and nothing
          // off a press is bagged - there is no packing path from it.
          if (!math.isPress) ...[
            number(
              'outWeight',
              'Output weight',
              note: '(kg) — blank = none',
              suffix: 'kg',
            ),
            number('packedSacks', 'Packed sacks'),
          ],

          // The yard gang that fed the cracker. What went in at the machine was
          // an estimate at the end of a shift, so it is correctable - and
          // correcting it re-prices the crumb that window made, because the
          // costing works the figure out from the runs rather than storing a
          // total.
          if (math.isCracker) ...[
            const SheetLabel('Picking — scrap yard'),
            FieldRow(
              left: number('pickingLabourers', 'Labourers'),
              right: number(
                'pickingHours',
                'Time worked',
                note: '(hrs)',
                suffix: 'hrs',
              ),
            ),
            DiffOut(
              math.pickingLabourHours != null
                  ? 'Picking: ${draft.pickingLabourers} × '
                        '${draft.pickingHours} h = '
                        '${math.pickingLabourHours} labourer-hours — costed '
                        'into ₹/kg crumb.'
                  : 'Both halves or neither — labourers on their own cost '
                        'nothing.',
            ),
          ],

          TextFieldRow(
            controller: c['remarks']!,
            label: 'Remarks',
            maxLines: 2,
            onChanged: (_) => setSheetState(() {}),
          ),

          const SheetLabel('Full record'),
          _Det('Machine', '${run.machine ?? machine?.name ?? '—'} · ${run.machineId}'),
          _Det('Line', run.line),
          _Det(
            'Type',
            math.isAuto
                ? 'Autoclave'
                : math.isPress
                ? 'Press'
                : isShiftwise
                ? 'Shiftwise'
                : 'Batch',
          ),
          if (math.isPress) ...[
            _Det('Product', run.product),
            _Det(
              'Moulded at',
              '${orNotSet(run.cureTempC, '°C')} · '
                  '${orNotSet(run.cyclicMin, 'min')} · '
                  '${run.cavities ?? '—'} cavities',
            ),
            _Det(
              'Compound rate',
              run.compoundRate != null ? '₹${run.compoundRate}/kg' : null,
            ),
            _Det(
              'Material cost',
              run.materialCost != null
                  ? '₹${run.materialCost}'
                        '${run.costPerPiece != null ? ' · ₹${run.costPerPiece} a piece' : ''}'
                  : null,
            ),
          ],
          _Det('Formulation', run.formulation),
          _Det('Capacity', run.capacity != null ? '${run.capacity} kg' : null),
          _Det(
            'Tyre',
            tyre != null ? '${tyre.label} ${run.mesh ?? tyre.mesh}' : run.mesh,
          ),
          _Det(
            'Mix sources',
            run.sources.isNotEmpty ? run.sources.join(' + ') : null,
          ),
          _Det(
            'Start / end',
            '${_stamp(run.startedAt) ?? '—'} → ${_stamp(run.endedAt) ?? '—'}',
          ),
          _Det('Start/stops combined', '${run.passes ?? 1}'),
          if (run.weighEntries.isNotEmpty)
            _Det('Weighings', run.weighEntries.join(' + ')),
          if (run.leftoutIn != null || run.leftoutOut != null)
            _Det(
              'Carried in / out',
              '${run.leftoutIn ?? 0} → ${run.leftoutOut ?? 0} kg',
            ),
          if (run.pickingLabourHours != null)
            _Det(
              'Picking',
              '${run.pickingLabourers} × ${run.pickingHours} h = '
                  '${run.pickingLabourHours} labourer-hours',
            ),
          if (run.nonProduction) _Det('Non-production', 'Yes'),
          _Det('Status', run.isRunning ? 'Running' : 'Logged'),
          _Det('Record id', run.id),

          if (math.issues.isNotEmpty) FormWarning(math.issues),
          if (error != null) FormWarning([error!]),
        ],
      );
    },
    actions: (context, setSheetState) => [
      AppButton(
        label: 'Cancel',
        onPressed: busy ? null : () => Navigator.of(context).pop(),
      ),
      AppButton(
        label: 'Save changes',
        variant: ButtonVariant.primary,
        loading: busy,
        onPressed: busy
            ? null
            : () async {
                sync();
                final math = runMath(run, draft);
                if (math.issues.isNotEmpty) {
                  setSheetState(() {});
                  return;
                }

                final payload = buildPayload(draft, base, math);
                if (payload.isEmpty) {
                  ui.notify('Nothing changed', ToastKind.warn);
                  return;
                }

                setSheetState(() {
                  busy = true;
                  error = null;
                });
                try {
                  final saved = await runService.update(run.id, payload);
                  // And tell the rest of the app to re-read itself, for the
                  // same reason the delete below does. The result this pops
                  // swaps the one row in the log behind this sheet; what a
                  // correction moves is added up from those rows elsewhere -
                  // the shift's output on Reports, the meter readings the next
                  // start pre-fills from - and a screen already built goes on
                  // showing the figure from before it.
                  ui.requestRefresh();
                  ui.notify('Entry updated');
                  if (context.mounted) {
                    Navigator.of(context).pop(RunSheetResult(saved: saved));
                  }
                } on ApiException catch (e) {
                  setSheetState(() {
                    busy = false;
                    error = e.message;
                  });
                  ui.notify(e.message, ToastKind.err);
                }
              },
      ),
    ],
    after: (context, setSheetState) => AppButton(
      label: 'Delete this entry',
      variant: ButtonVariant.danger,
      expand: true,
      onPressed: busy
          ? null
          : () async {
              final go = await confirmSheet(
                context: context,
                title: 'Delete this entry?',
                subtitle: '$label · $when',
                body:
                    "Permanently removes this entry from the plant's record. "
                    'The production, energy and cost figures it counts towards '
                    'drop with it. This cannot be undone.',
                keepLabel: 'Keep entry',
              );
              if (!go) return;

              setSheetState(() {
                busy = true;
                error = null;
              });
              try {
                // What went with it - the sacks off its stock group, the
                // samples off the lab's table - rather than "deleted" and
                // nothing about the yard moving.
                final summary = deletedSummary(await runService.remove(run.id));
                // And tell the rest of the app to re-read itself: a delete
                // moves the yard as well, and a Stock tab that is already built
                // would go on drawing a card for stock that no longer exists.
                ui.requestRefresh();
                ui.notify(
                  summary.message,
                  summary.warn ? ToastKind.warn : ToastKind.ok,
                );
                if (context.mounted) {
                  Navigator.of(context).pop(RunSheetResult(deletedId: run.id));
                }
              } on ApiException catch (e) {
                setSheetState(() {
                  busy = false;
                  error = e.message;
                });
                ui.notify(e.message, ToastKind.err);
              }
            },
    ),
  );

  for (final controller in c.values) {
    controller.dispose();
  }
  return result;
}

/// "29 Jul 12:35" - the day and the 24-hour clock the shop floor reads.
String? _stamp(String? iso) =>
    iso == null || iso.isEmpty ? null : '${dayMonth(iso)} ${clock24(iso)}';

/// One line of the Full record: what it is on the left, what it reads right.
class _Det extends StatelessWidget {
  const _Det(this.k, this.v);
  final String k;
  final String? v;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 128,
          child: Text(
            k,
            style: const TextStyle(fontSize: 11.5, color: T.inkFaint),
          ),
        ),
        Expanded(
          child: Text(
            // Nothing recorded reads as a dash rather than as an empty gap.
            (v == null || v!.isEmpty) ? '—' : v!,
            style: const TextStyle(fontSize: 11.5, color: T.inkDim),
          ),
        ),
      ],
    ),
  );
}
