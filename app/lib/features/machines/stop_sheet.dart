import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../core/utils/moulding_batch.dart';
import '../../state/runs_store.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/sheet.dart';
import '../../widgets/ui.dart';
import 'machine_rules.dart';

/// What the stop sheet came back with, so the page can act on it.
class StopResult {
  const StopResult({this.stopped = false, this.cancelRequested = false});
  final bool stopped;

  /// The crew pressed "Cancel this load (entered by mistake)" - the page opens
  /// the cancel confirmation, which clears every row open on that machine.
  final bool cancelRequested;
}

/// Stopping a run, and what each kind of machine is asked for as it goes.
///
///   autoclave    discharged rather than stopped: firewood, the crew, and when
///                it was pulled. Nothing comes off it to weigh - the batch is
///                weighed once the refiners have worked through it.
///   press        the pieces counted, the weight on the scale and the flash
///                trimmed off. Material is charged on the weight plus the
///                flash, because that compound was spent either way.
///   sleeve/loop  the same, plus what the cycle and the mould said the run
///                should have made - shown, never enforced.
///   metered      both meter readings, or the differences where only those are
///                known, and the output weight.
///
/// A port of the stop half of client/src/pages/user/MachinesPage.tsx.
Future<StopResult?> showStopSheet({
  required BuildContext context,
  required Run run,
  required Machine? machine,
}) async {
  final ui = context.read<UiStore>();
  final runs = context.read<RunsStore>();
  final batches = context.read<BatchesStore>();

  final kind = machine?.kind ?? run.kind;
  final withMeters = hasMeters(machine, kind: kind);
  final isAutoclave = kind == 'autoclave';
  final isPress = isPressKind(kind);
  final isMouldingBench = isMoulding(kind);

  /// Both benches that are logged on a count rather than on a scale reading.
  final countsPieces = isPress || isMouldingBench;

  /// A machine that weighs but has no meters on it - the Soorya Grinder.
  ///
  /// Its own branch because the crew count lives inside the meters block, as the
  /// field beside the electricity reading. Switching the meters off would take
  /// the crew with them, and the shift would go down with nobody on the machine.
  final noMeters = !withMeters && !isAutoclave && !countsPieces;

  // The line the run was started on has the last word: a coarse-line machine
  // put on the special line for a batch is not a shiftwise run.
  final shiftwise = run.line != null
      ? lineIsShiftwise(run.line)
      : isShiftwiseKind(kind);

  /// The cracker, and only the cracker, is asked about picking - it is the gang
  /// that pulls scrap tyres out of the yard and feeds it. What they cost goes
  /// into the crumb the grinding line makes, and from there into what the
  /// autoclave charge cost, so it reaches the reclaim without being a line
  /// anybody has to add.
  final crackerShift = isCracker(run.machineId);

  /// Whether this run could have had a second batch going through it: the
  /// refining passes, which is where the plant mixes. A shift on the grinding
  /// or coarse line has no batch at all, a press and a bench make finished
  /// goods, and an autoclave charge is one batch by definition - it is the
  /// vessel that makes it.
  final canMix =
      (run.batchNo ?? '').trim().isNotEmpty &&
      !shiftwise &&
      !isAutoclave &&
      !countsPieces;

  // A machine that weighs at the sheet asks for the figure here; one weighed
  // shiftwise is told where the figure gets entered instead.
  final weighsHere = machine != null
      ? machine.weigh && !shiftwise
      : (run.needsWeigh ?? false);
  final weighedLater = (machine?.outWeight ?? false) && shiftwise;

  // ---- form state ----
  // The crew this machine usually runs with, so the common case is a glance
  // rather than a keystroke. An autoclave's crew follows the charge: shared
  // with the twin, or not.
  final usual = isAutoclave
      ? autoclaveWorkers(run.paired)
      : defaultWorkers(run.machineId, run.shift, isShiftwiseKind(kind));

  final workers = TextEditingController(
    text: numText(run.workers ?? usual),
  );
  final outWeight = TextEditingController();
  final elecEnd = TextEditingController();
  final elecDiff = TextEditingController();
  final hourEnd = TextEditingController();
  final hourDiff = TextEditingController();

  // A load burns a known amount of firewood, so the figure is there to correct
  // rather than to type.
  final firewood = TextEditingController(
    text: isAutoclave
        ? '${shiftwise ? firewoodKgPerCoarseLoad : firewoodKgPerLoad}'
        : '',
  );
  var dischargeDate = '';
  var unloadTime = '';

  final pieces = TextEditingController();
  final flash = TextEditingController();

  /// The batches mixed into the one this pass is filed under.
  ///
  /// The start sheet asks for this too, and asking again here is the point: a
  /// pass is started on the batch that is ready and the tailings of the last
  /// one go in when they are tipped, which is after the machine is running. A
  /// mix that could only be named at the start sheet was a mix named before it
  /// had happened - so the crew either guessed or, as five runs in August show,
  /// typed both numbers into the batch box with a comma between them.
  ///
  /// Opens on whatever the run already carries - the batch it is filed under
  /// leads the stored list, so the tailings are the rest - which is what keeps
  /// stopping a pass from quietly dropping a mix picked at the start.
  var mix = run.sources.skip(1).toList();

  // A lot stopped and started again inside the shift is one record, so the
  // sheet opens on the note the earlier stop left rather than asking twice.
  final remarks = TextEditingController(text: run.remarks ?? '');

  // The picking gang, as the shift already has it. A cracker stopped for a
  // blockage and started again is the same shift's record, so the second sheet
  // opens on what the first one entered rather than asking the gang to be
  // counted twice.
  final pickLabourers = TextEditingController(
    text: numText(run.pickingLabourers),
  );
  final pickHours = TextEditingController(text: numText(run.pickingHours));

  var busy = false;

  final result = await showAppSheet<StopResult>(
    context: context,
    title: isAutoclave
        ? 'Unload Autoclave${shiftwise ? ' · Coarse' : ''}'
        : 'Stop ${run.machine ?? run.machineId}',
    subtitle: _subtitleFor(
      run: run,
      isAutoclave: isAutoclave,
      isPress: isPress,
      isMouldingBench: isMouldingBench,
      shiftwise: shiftwise,
      withMeters: withMeters,
    ),
    led: T.brand,
    body: (context, setSheetState) {
      final elecEndValue = asNumber(elecEnd.text);
      final hourEndValue = asNumber(hourEnd.text);
      final weightValue = asNumber(outWeight.text);
      final piecesValue = asNumber(pieces.text);
      final flashValue = asNumber(flash.text);

      final elecDelta = (elecEndValue != null && run.elecStart != null)
          ? round2(elecEndValue - run.elecStart!)
          : null;
      final hourDelta = (hourEndValue != null && run.hourStart != null)
          ? round2(hourEndValue - run.hourStart!)
          : null;

      final issues = _issues(
        run: run,
        withMeters: withMeters,
        countsPieces: countsPieces,
        isPress: isPress,
        isMouldingBench: isMouldingBench,
        crackerShift: crackerShift,
        elecEndValue: elecEndValue,
        hourEndValue: hourEndValue,
        weightValue: weightValue,
        piecesValue: piecesValue,
        flashValue: flashValue,
        pickLabourers: asNumber(pickLabourers.text),
        pickHours: asNumber(pickHours.text),
      );

      // What a sleeve or loop lot was expected to make, worked out from how
      // long the bench has been running, the cycle it was set up at and the
      // mould on it - so the crew sees the figure they are about to be measured
      // against before they commit the count rather than after.
      //
      // It is shown and never enforced. The count off the bench is the figure
      // of record - a mould that ran short made what it made - so a wide gap is
      // a warning and not a refusal.
      final mouldExpected = isMouldingBench
          ? expectedPieces(
              runtimeMin: minutesBetween(run.startedAt, null, pausedMs(run)),
              cyclicMin: run.cyclicMin,
              cavities: run.cavities,
            )
          : null;
      final mouldVariance = variancePct(piecesValue, mouldExpected);
      final mouldFlagged = overVariance(mouldVariance);

      // Material is charged on the weight plus the flash - that compound was
      // spent either way - at the rate the run was started under, and cost per
      // piece spreads it over the pieces made. Nothing else about a press run
      // is costed: it records no hours and no units.
      final rate = run.compoundRate;
      final charged = round2((weightValue ?? 0) + (flashValue ?? 0));
      final material = (isPress && rate != null && charged > 0)
          ? round2(rate * charged)
          : null;
      final perPiece =
          (material != null && piecesValue != null && piecesValue > 0)
          ? round2(material / piecesValue)
          : null;

      final pickLabourHours =
          ((asNumber(pickLabourers.text) ?? 0) > 0 &&
              (asNumber(pickHours.text) ?? 0) > 0)
          ? round2(
              asNumber(pickLabourers.text)! * asNumber(pickHours.text)!,
            )
          : null;

      final tally = run.weighEntries;

      // The open batches this pass could have taken tailings from: out of the
      // vessel, and not the batch it is already filed under.
      final mixable = canMix
          ? batches.refinable
                .where((b) => b.ref != (run.batchNo ?? '').trim())
                .toList()
          : const <Batch>[];

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // An autoclave has no meters: what it burned, who charged it, and
          // when it was pulled.
          if (isAutoclave) ...[
            FieldRow(
              left: TextFieldRow(
                controller: firewood,
                label: 'Firewood',
                suffix: 'kg',
                decimal: true,
              ),
              right: TextFieldRow(
                controller: workers,
                label: 'Workers',
                integer: true,
                placeholder: '0',
              ),
            ),
            DateFieldRow(
              label: 'Discharge date',
              note: '— loaded ${dayMonth(run.shiftDate)}',
              value: dischargeDate,
              onChanged: (v) => setSheetState(() => dischargeDate = v),
            ),
            TimeFieldRow(
              label: 'Unloading time',
              note: '— loaded ${clock24(run.startedAt)}; blank = now',
              value: unloadTime,
              onChanged: (v) => setSheetState(() => unloadTime = v),
            ),
          ],

          // The batches that went through together, asked at the machine as it
          // is stopped.
          //
          // The start sheet asks too, and this is the same question at the
          // moment the crew can actually answer it: a pass is started on the
          // batch that is ready, and the tailings of the last one go in when
          // they are tipped. Whatever was picked at the start is already lit,
          // so stopping a pass that began with two batches does not drop the
          // second by saying nothing.
          //
          // "Nothing mixed" is a tile rather than an empty grid, so skipping it
          // is an answer somebody gave rather than a question they missed.
          if (canMix) ...[
            SheetLabel(
              'Mixed in',
              note: '— other batches that went through with ${run.batchNo}',
            ),
            if (mixable.isEmpty)
              const Hint('No other batch is open to have gone through with it.')
            else
              PickGrid(
                children: [
                  Pick(
                    title: 'Nothing mixed',
                    sub: 'just this batch',
                    selected: mix.isEmpty,
                    onTap: () => setSheetState(() => mix = []),
                  ),
                  for (final b in mixable)
                    Pick(
                      title: b.ref,
                      mono: true,
                      dot: b.grade == null ? null : qualityColour[b.grade],
                      sub: b.formulation,
                      selected: mix.contains(b.ref),
                      onTap: () {
                        if (mix.contains(b.ref)) {
                          setSheetState(
                            () => mix = mix.where((r) => r != b.ref).toList(),
                          );
                        } else if (mix.length >= 3) {
                          // Four columns is all the record has room for, and
                          // one of them is the batch it is filed under.
                          ui.notify('Up to 4 batches per mix', ToastKind.warn);
                        } else {
                          setSheetState(() => mix = [...mix, b.ref]);
                        }
                      },
                    ),
                ],
              ),
            if (mix.isNotEmpty)
              Hint(
                'Filed under ${run.batchNo} — ${mix.join(' and ')} '
                '${mix.length == 1 ? 'goes' : 'go'} through with it as '
                'tailings. The run stays recorded against ${run.batchNo}, '
                'which is what the batch card, the weighing and the costing '
                'all follow.',
              ),
          ],

          if (withMeters) ...[
            FieldRow(
              left: TextFieldRow(
                controller: elecEnd,
                label: 'Final electricity reading',
                note: run.elecStart != null
                    ? '— started at ${run.elecStart}'
                    : null,
                suffix: 'units',
                decimal: true,
                placeholder: 'meter reading now',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: workers,
                label: 'Workers',
                integer: true,
                placeholder: '0',
              ),
            ),
            if (elecDelta != null)
              DiffOut(
                elecDelta < 0
                    ? 'The electricity meter reads lower at the end than at '
                          'the start.'
                    : 'Consumed: $elecEndValue − ${run.elecStart} = '
                          '$elecDelta units',
                bad: elecDelta < 0,
              ),
            TextFieldRow(
              controller: elecDiff,
              label: '…or enter the difference directly',
              note: '— when only the used units are known',
              suffix: 'units',
              decimal: true,
              placeholder: 'units used',
            ),
          ],

          // ---- what came off a press ----
          if (isPress) ...[
            Readout(
              label: 'Moulded at',
              value:
                  '${orNotSet(run.cureTempC, '°C')} · '
                  '${orNotSet(run.cyclicMin, 'min')} · '
                  '${run.cavities ?? '—'} cavities',
            ),
            FieldRow(
              left: TextFieldRow(
                controller: pieces,
                label: 'How many',
                note: '— pieces produced',
                suffix: 'nos',
                integer: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: workers,
                label: 'Workers',
                integer: true,
                placeholder: '0',
              ),
            ),
            FieldRow(
              left: TextFieldRow(
                controller: outWeight,
                label: 'Weight',
                note: '— weighed output',
                suffix: 'kg',
                decimal: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: flash,
                label: 'Flash',
                note: '— waste compound',
                suffix: 'kg',
                decimal: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
            ),
            // The arithmetic, spelled out before it is committed - the same way
            // a meter pair shows its difference.
            if (material != null)
              DiffOut(
                'Material: (${weightValue ?? 0} + ${flashValue ?? 0}) × ₹$rate '
                '= ₹$material'
                '${perPiece != null ? ' ÷ $piecesValue pcs = ₹$perPiece a piece' : ''}',
              )
            else
              Hint(
                rate == null
                    ? 'No compound rate against this product, so the run logs '
                          'without a material cost.'
                    : 'Material cost shows once the weight is in.',
              ),
            const Hint(
              'Power, labour and overhead are not costed on a press: it records '
              'no hours and no units for them to be spread over.',
            ),
          ],

          // ---- what a sleeve or loop shift made ----
          if (isMouldingBench) ...[
            Readout(
              label: 'Lot',
              value: run.batchNo ?? '—',
              valueColour: T.brand,
            ),
            if (mouldExpected != null)
              Readout(
                label: 'Expected',
                value: '$mouldExpected pcs',
                valueColour: T.steel,
              ),
            FieldRow(
              left: TextFieldRow(
                controller: pieces,
                label: 'How many',
                note: '— actually counted',
                suffix: 'nos',
                integer: true,
                placeholder: mouldExpected != null ? '$mouldExpected' : '0',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: workers,
                label: 'Workers',
                note: '— on the activity',
                integer: true,
                placeholder: '0',
              ),
            ),
            FieldRow(
              left: TextFieldRow(
                controller: outWeight,
                label: 'Weight',
                note: '— weighed output',
                suffix: 'kg',
                decimal: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: flash,
                label: 'Flash',
                note: '— waste compound',
                suffix: 'kg',
                decimal: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
            ),
            // A wide gap is said out loud and never refused: the count off the
            // bench is what was made, and the crew is being told the figure
            // will be flagged, not being asked to change it.
            if (mouldVariance != null)
              DiffOut(
                'Expected $mouldExpected, counted $piecesValue = '
                '${mouldVariance > 0 ? '+' : ''}$mouldVariance%'
                '${mouldFlagged ? ' — over $piecesVariancePct%, so this run is flagged for the back office.' : ' — within the usual range.'}',
                bad: mouldFlagged,
              )
            else
              Hint(
                (run.cyclicMin == null || run.cavities == null)
                    ? 'No cycle time or cavities were set on this run, so there '
                          'is nothing to compare the count against.'
                    : 'The comparison shows once the count is in.',
              ),
            TextFieldRow(
              controller: remarks,
              label: 'Remarks',
              note: '— anything about this lot worth knowing later',
              maxLines: 2,
              placeholder: 'mould change, short run, material problem…',
            ),
            Hint(
              'The pieces go to the yard under ${run.batchNo ?? 'this lot'} '
              'awaiting the lab once they are boxed in the Packing tab. Only a '
              'lot the lab has passed can be dispatched.',
            ),
          ],

          if (noMeters)
            TextFieldRow(
              controller: workers,
              label: 'Workers',
              note: '— no meters on this machine, so crew and weight are all '
                  'it records',
              integer: true,
              placeholder: '0',
            ),

          // Nothing comes off an autoclave to weigh - the batch is weighed once
          // the refiners have worked through it.
          if (!isAutoclave &&
              !countsPieces &&
              (!withMeters || weighsHere))
            TextFieldRow(
              controller: outWeight,
              label: 'Output weight',
              note: weighsHere
                  ? '— optional, or weigh later'
                  : '— blank sends it to the Weigh tab',
              suffix: 'kg',
              decimal: true,
              placeholder: 'leave blank to weigh later',
              onChanged: (_) => setSheetState(() {}),
            ),

          if (withMeters) ...[
            TextFieldRow(
              controller: hourEnd,
              label: 'Hour-meter reading at stop',
              note: run.hourStart != null
                  ? '— started at ${run.hourStart}'
                  : null,
              suffix: 'hrs',
              decimal: true,
              placeholder: 'hour meter now',
              onChanged: (_) => setSheetState(() {}),
            ),
            if (hourDelta != null)
              DiffOut(
                hourDelta < 0
                    ? 'The hour meter reads lower at the stop than at the '
                          'start.'
                    : 'Run: $hourEndValue − ${run.hourStart} = $hourDelta hrs',
                bad: hourDelta < 0,
              ),
            TextFieldRow(
              controller: hourDiff,
              label: '…or enter the hours run directly',
              note: '— when only the difference is known',
              suffix: 'hrs',
              decimal: true,
              placeholder: 'hours run',
            ),
          ],

          // ---- picking ----
          // The gang that pulls scrap tyres out of the yard and feeds the
          // cracker. It is the first labour spent on a kg of reclaim, and it
          // was spent nowhere until this field existed: no box asked, so no
          // figure carried it, so a shift that put four extra hands on the yard
          // looked exactly as cheap as one that put none.
          if (crackerShift) ...[
            const SheetLabel('Picking — scrap yard'),
            FieldRow(
              left: TextFieldRow(
                controller: pickLabourers,
                label: 'Labourers',
                note: '— on picking',
                suffix: 'nos',
                integer: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
              right: TextFieldRow(
                controller: pickHours,
                label: 'Time worked',
                note: '— roughly',
                suffix: 'hrs',
                decimal: true,
                placeholder: '0',
                onChanged: (_) => setSheetState(() {}),
              ),
            ),
            if (pickLabourHours != null)
              DiffOut(
                'Picking: ${pickLabourers.text} × ${pickHours.text} h = '
                '$pickLabourHours labourer-hours — costed into ₹/kg crumb, and '
                'from there into the reclaim.',
              )
            else
              const Hint(
                'An estimate is fine — how many were on the yard, and about how '
                "long. It goes into what a kg of crumb costs, so leaving it "
                "blank prices this shift's picking at nothing.",
              ),
          ],

          if (weighedLater)
            Hint(
              tally.isNotEmpty
                  ? '${tally.length} load${tally.length > 1 ? 's' : ''} tallied '
                        '· ${round2(tally.fold<num>(0, (a, b) => a + b))} kg — '
                        'finalise and submit it in the Weigh tab after stopping.'
                  : 'Output is weighed shiftwise in the Weigh tab after '
                        'stopping.',
            ),

          if (issues.isNotEmpty) FormWarning(issues),
        ],
      );
    },
    actions: (context, setSheetState) {
      final issues = _issues(
        run: run,
        withMeters: withMeters,
        countsPieces: countsPieces,
        isPress: isPress,
        isMouldingBench: isMouldingBench,
        crackerShift: crackerShift,
        elecEndValue: asNumber(elecEnd.text),
        hourEndValue: asNumber(hourEnd.text),
        weightValue: asNumber(outWeight.text),
        piecesValue: asNumber(pieces.text),
        flashValue: asNumber(flash.text),
        pickLabourers: asNumber(pickLabourers.text),
        pickHours: asNumber(pickHours.text),
      );

      return [
        AppButton(
          label: isAutoclave ? 'Cancel' : 'Keep running',
          onPressed: busy
              ? null
              : () => Navigator.of(context).pop(const StopResult()),
        ),
        AppButton(
          label: isAutoclave
              ? 'Log & unload'
              : (withMeters || countsPieces)
              ? 'Log run'
              : 'Stop run',
          variant: ButtonVariant.primary,
          loading: busy,
          onPressed: (busy || issues.isNotEmpty)
              ? null
              : () async {
                  setSheetState(() => busy = true);
                  final okay = await _confirmStop(
                    run: run,
                    machine: machine,
                    isAutoclave: isAutoclave,
                    isPress: isPress,
                    isMouldingBench: isMouldingBench,
                    countsPieces: countsPieces,
                    withMeters: withMeters,
                    shiftwise: shiftwise,
                    crackerShift: crackerShift,
                    dischargeDate: dischargeDate,
                    unloadTime: unloadTime,
                    firewood: firewood.text,
                    workers: workers.text,
                    outWeight: outWeight.text,
                    elecEnd: elecEnd.text,
                    elecDiff: elecDiff.text,
                    hourEnd: hourEnd.text,
                    hourDiff: hourDiff.text,
                    pieces: pieces.text,
                    flash: flash.text,
                    canMix: canMix,
                    mix: mix,
                    remarks: remarks.text,
                    pickLabourers: pickLabourers.text,
                    pickHours: pickHours.text,
                    runs: runs,
                    batches: batches,
                    ui: ui,
                  );
                  setSheetState(() => busy = false);
                  if (okay && context.mounted) {
                    Navigator.of(context).pop(const StopResult(stopped: true));
                  }
                },
        ),
      ];
    },
    after: (context, setSheetState) =>
        (withMeters || isAutoclave || countsPieces)
        ? AppButton(
            label:
                'Cancel this ${countsPieces ? 'run' : 'load'} '
                '(entered by mistake)',
            variant: ButtonVariant.danger,
            expand: true,
            onPressed: () => Navigator.of(
              context,
            ).pop(const StopResult(cancelRequested: true)),
          )
        : const SizedBox.shrink(),
  );

  workers.dispose();
  outWeight.dispose();
  elecEnd.dispose();
  elecDiff.dispose();
  hourEnd.dispose();
  hourDiff.dispose();
  firewood.dispose();
  pieces.dispose();
  flash.dispose();
  remarks.dispose();
  pickLabourers.dispose();
  pickHours.dispose();

  return result;
}

String _subtitleFor({
  required Run run,
  required bool isAutoclave,
  required bool isPress,
  required bool isMouldingBench,
  required bool shiftwise,
  required bool withMeters,
}) {
  if (isAutoclave) {
    return [
      run.batchNo,
      run.formulation,
      run.quality,
    ].where((s) => s != null && s.isNotEmpty).join(' · ');
  }
  if (isMouldingBench) {
    // The lot first: it is what the pieces will stand in the yard under, and
    // what the lab will answer on.
    return [
      run.batchNo,
      run.product,
      'ran ${runElapsed(run)}',
      'started ${clockSec(run.startedAt)}',
    ].where((s) => s != null && s.isNotEmpty).join(' · ');
  }
  if (isPress) {
    return [
      run.product,
      run.batchNo,
      'ran ${runElapsed(run)}',
      'started ${clockSec(run.startedAt)}',
    ].where((s) => s != null && s.isNotEmpty).join(' · ');
  }
  if (shiftwise) {
    // A shift, not a batch: which shift it ran for, and on what.
    final tyre = run.tyreType != null ? tyres[run.tyreType] : null;
    return [
      '${run.shift} ${dayMonth(run.shiftDate)}'.trim(),
      if (tyre != null) '${tyre.label} ${tyre.mesh}',
    ].join(' · ');
  }
  if (withMeters) {
    final named = [
      run.batchNo,
      run.formulation,
      run.quality,
    ].where((s) => s != null && s.isNotEmpty).join(' · ');
    return named.isEmpty
        ? 'Running ${runElapsed(run)} · started ${clockSec(run.startedAt)}'
        : named;
  }
  return 'Running ${runElapsed(run)} · started ${clockSec(run.startedAt)}'
      '${run.batchNo != null ? ' · ${run.batchNo}' : ''}';
}

/// A meter can never read lower at the end than it did at the start, and
/// anything that should be a quantity - energy, hours, weight - cannot be zero
/// or negative. Checked as the crew types, so the problem shows up before they
/// commit the run rather than after.
List<String> _issues({
  required Run run,
  required bool withMeters,
  required bool countsPieces,
  required bool isPress,
  required bool isMouldingBench,
  required bool crackerShift,
  required num? elecEndValue,
  required num? hourEndValue,
  required num? weightValue,
  required num? piecesValue,
  required num? flashValue,
  required num? pickLabourers,
  required num? pickHours,
}) {
  final issues = <String>[];

  if (withMeters) {
    final elecStart = run.elecStart;
    if (elecEndValue != null) {
      if (elecEndValue <= 0) {
        issues.add(
          'Electricity: the final reading must be greater than zero.',
        );
      } else if (elecStart != null && elecEndValue < elecStart) {
        issues.add(
          'Electricity: final reading ($elecEndValue) is below the start '
          '($elecStart) — a meter cannot run backwards.',
        );
      } else if (elecStart != null && elecEndValue == elecStart) {
        issues.add(
          'Electricity: the reading has not moved, so energy used would be '
          'zero.',
        );
      }
    }
    final hourStart = run.hourStart;
    if (hourEndValue != null) {
      if (hourEndValue <= 0) {
        issues.add('Hour-meter: the stop reading must be greater than zero.');
      } else if (hourStart != null && hourEndValue < hourStart) {
        issues.add(
          'Hour-meter: stop reading ($hourEndValue) is below the start '
          '($hourStart) — it cannot go backwards.',
        );
      } else if (hourStart != null && hourEndValue == hourStart) {
        issues.add(
          'Hour-meter: the reading has not moved, so run time would be zero.',
        );
      }
    }
  }

  if (weightValue != null && weightValue <= 0) {
    issues.add(
      isPress
          ? 'Weight: must be greater than zero — weigh what came off the press.'
          : isMouldingBench
          ? 'Weight: must be greater than zero — weigh what came off the bench.'
          : 'Output weight: must be greater than zero (leave it blank to weigh '
                'later).',
    );
  }

  if (crackerShift) {
    if (pickLabourers != null &&
        (pickLabourers < 0 || pickLabourers != pickLabourers.roundToDouble())) {
      issues.add('Picking: a whole number of labourers.');
    }
    if (pickHours != null && (pickHours < 0 || pickHours > 24)) {
      issues.add('Picking: hours have to be between nothing and a day.');
    }
    // Half an answer costs nothing at all once it is multiplied out, which
    // reads exactly like a shift that did no picking.
    if (((pickLabourers ?? 0) > 0) != ((pickHours ?? 0) > 0)) {
      issues.add('Picking: enter both the labourers and the hours, or neither.');
    }
  }

  if (countsPieces) {
    if (piecesValue != null &&
        (piecesValue <= 0 || piecesValue != piecesValue.roundToDouble())) {
      issues.add('How many: a whole number of pieces, above zero.');
    }
    if (flashValue != null && flashValue < 0) {
      issues.add('Flash: cannot be less than nothing.');
    }
  }

  return issues;
}

Future<bool> _confirmStop({
  required Run run,
  required Machine? machine,
  required bool isAutoclave,
  required bool isPress,
  required bool isMouldingBench,
  required bool countsPieces,
  required bool withMeters,
  required bool shiftwise,
  required bool crackerShift,
  required String dischargeDate,
  required String unloadTime,
  required String firewood,
  required String workers,
  required String outWeight,
  required String elecEnd,
  required String elecDiff,
  required String hourEnd,
  required String hourDiff,
  required String pieces,
  required String flash,

  /// Whether the sheet asked about a mix at all, and what it was left on. An
  /// emptied list is the crew taking a mix back off, which is a different thing
  /// from a sheet that never asked - so the field is left out entirely when it
  /// did not.
  required bool canMix,
  required List<String> mix,
  required String remarks,
  required String pickLabourers,
  required String pickHours,
  required RunsStore runs,
  required BatchesStore batches,
  required UiStore ui,
}) async {
  final weightValue = asNumber(outWeight);
  final piecesValue = asNumber(pieces);
  final flashValue = asNumber(flash);

  // A press, sleeve or loop run is the count of what it made, so that count is
  // the point of logging it - there is nothing to weigh later and no second
  // chance at it.
  if (countsPieces) {
    if (piecesValue == null) {
      ui.notify('Enter how many pieces it made', ToastKind.warn);
      return false;
    }
    if (weightValue == null) {
      ui.notify(
        isMouldingBench
            ? 'Enter the weight that came off the bench'
            : 'Enter the weight that came off the press',
        ToastKind.warn,
      );
      return false;
    }
  }

  // Discharging an autoclave is dated by hand: the crew often logs a load after
  // the fact, and a charge pulled at 02:00 belongs to the day it was pulled on.
  // A time makes the instant exact; without one, a discharge dated today is
  // "now" and any earlier day is booked at midday.
  String? stoppedAt;
  if (isAutoclave) {
    if (dischargeDate.isEmpty) {
      ui.notify('Pick the discharge date', ToastKind.warn);
      return false;
    }
    stoppedAt =
        atLocal(dischargeDate, unloadTime) ??
        (dischargeDate == todayISO() ? null : atLocal(dischargeDate, '12:00'));
  }

  final logged = await runs.stop(run.id, {
    if (stoppedAt != null) 'stoppedAt': stoppedAt,
    'outWeight': isAutoclave ? null : weightValue,
    'workers': asNumber(workers),
    'firewoodKg': isAutoclave ? asNumber(firewood) : null,
    // The reading itself when there is one; the difference is what the crew
    // falls back to when only the units used are known.
    'elecEnd': withMeters ? asNumber(elecEnd) : null,
    'hourEnd': withMeters ? asNumber(hourEnd) : null,
    'kwh': withMeters ? asNumber(elecDiff) : null,
    'hoursRun': withMeters ? asNumber(hourDiff) : null,
    // What came out of the mould. The flash counts as material spent, so a
    // bench with no flash trimmed off it says zero rather than nothing.
    'pieces': countsPieces ? piecesValue : null,
    'flashKg': countsPieces ? (flashValue ?? 0) : null,
    // The note against a lot. Only the sleeve and loop sheets ask for one, and
    // a blank stays blank rather than being sent as an empty string that reads
    // as a note somebody left.
    'remarks': isMouldingBench
        ? (remarks.trim().isEmpty ? null : remarks.trim())
        : null,
    // The yard gang that fed the cracker. Sent only from the cracker's own
    // sheet, and the server ignores it from anywhere else.
    'pickingLabourers': crackerShift ? asNumber(pickLabourers) : null,
    'pickingHours': crackerShift ? asNumber(pickHours) : null,
    // The batches that went through together. The one the run is filed under
    // leads the list the server stores; the server takes it off the run rather
    // than off this sheet, so a mix cannot re-file the pass.
    if (canMix)
      'sources': mix.isEmpty
          ? <String>[]
          : [run.batchNo!.trim(), ...mix],
  });

  if (logged == null) return false;

  final variance = isMouldingBench
      ? variancePct(
          piecesValue,
          expectedPieces(
            runtimeMin: minutesBetween(run.startedAt, null, pausedMs(run)),
            cyclicMin: run.cyclicMin,
            cavities: run.cavities,
          ),
        )
      : null;

  ui.notify(
    isAutoclave
        ? 'Unloaded · logged'
        : isMouldingBench
        // Named by the lot rather than by the machine: the batch number is what
        // the pieces are now standing in the yard under.
        ? '${run.batchNo ?? machine?.short ?? ''} · $piecesValue pcs logged'
              '${overVariance(variance) ? ' · ${variance! > 0 ? '+' : ''}$variance% vs expected' : ''}'
        : isPress
        ? '${machine?.short ?? run.machineId} · $piecesValue pcs logged'
        // A shiftwise stop is named by the shift it was run for, and says so
        // when it was folded into one the shift already had.
        : '${shiftwise ? '${machine?.short ?? run.machine ?? run.machineId} · ${run.shift}' : 'Run'} logged'
              '${(logged.passes ?? 1) > 1 ? ' · ${logged.passes} start/stops combined' : ''}',
  );

  // Logging a run moves the batch on: unloading takes it out of the vessel and
  // releases it to the refiners, and an R4 pass marks the grade it yielded.
  // Both happen server-side, so the list is re-read rather than patched here.
  if (isAutoclave || run.batchNo != null) await batches.fetchOpen();
  return true;
}
