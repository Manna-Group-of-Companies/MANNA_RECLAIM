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

/// Starting a run - every machine on the plant, in one sheet that asks each for
/// what it actually records.
///
///   autoclave    a formulation, whether the load was shared with the twin
///                vessel, a batch number and the two dates a charge has. A
///                special charge opens the batch the refiners will work
///                through; a coarse or DRC one only starts the run.
///   press        the product it is moulding, and the two settings the floor
///                may change for this run. No meters: a press records none.
///   sleeve/loop  the same, plus the lot number the run will be filed under,
///                shown read-only because the server generates it.
///   refiner      the batch it is refining, its grade, and both meter readings.
///   shiftwise    the shift it is running for, its feedstock, and both meters.
///
/// A port of the start half of client/src/pages/user/MachinesPage.tsx. Returns
/// true when something was actually started.
Future<bool?> showStartSheet({
  required BuildContext context,
  required Machine machine,

  /// Set only for a machine that was asked which line it is on; every other
  /// machine has one line and reads it off its kind.
  String? line,

  /// The run this machine last finished, for the "last end" note beside each
  /// meter field - both meters carry on from where the last run left them.
  Run? previous,
}) async {
  final ui = context.read<UiStore>();
  final runs = context.read<RunsStore>();
  final batches = context.read<BatchesStore>();
  final products = context.read<ProductsStore>();

  final isAutoclave = machine.kind == 'autoclave';
  final isPress = isPressKind(machine.kind);
  final isMouldingBench = isMoulding(machine.kind);
  final picksProduct = isPress || isMouldingBench;
  final metered = hasMeters(machine);
  final shiftwise = line != null ? line == 'coarse' : isShiftwiseKind(machine.kind);
  final special = line == 'special';

  /// The sheets that pick a batch off the open list rather than only typing one.
  final picksBatch = isRefiner(machine) || special;

  // ---- form state ----
  var quality = 'Special';
  var batchNo = '';

  /// Any sheet that refines a batch: the other batches whose tailings are going
  /// through with the one being refined. The batch itself is not in here - it
  /// leads the list that gets sent, and cannot be mixed with itself.
  ///
  /// Filled by tapping the Batch grid a second time - see tapBatch. It was a
  /// grid of its own under "Mixed from", offered on the special line alone,
  /// which got both halves of this wrong. A refiner takes two batches at a time
  /// and could not say so at all, so a pass with two batches in it went on
  /// record as a pass on one; and a second grid of the same numbers is not what
  /// "pick two batches" looks like to a crew in gloves. One grid, and the tap
  /// after the first mixes one in.
  var mix = <String>[];
  var startDate = todayISO();
  var startShift = currentShift();

  /// Special line only: the rare pass that yields nothing to weigh.
  var nonProd = false;
  String? tyre = machine.tyre ? (machine.defTyre ?? 'truck') : null;

  final elecStart = TextEditingController(text: numText(previous?.elecEnd));
  final hourStart = TextEditingController(text: numText(previous?.hourEnd));

  // ---- autoclave ----
  // A vessel that can only be charged one way has that formulation picked
  // already; anything else is a decision.
  final forms = isAutoclave ? autoclaveFormsFor(machine.capacity) : const <AutoclaveForm>[];
  AutoclaveForm? form = forms.length == 1 ? forms.first : null;

  // The two dates are deliberately separate: a night shift that runs past
  // midnight keeps the date it started on, while the load itself happened on
  // whatever day the clock says - so a charge put in at 01:00 belongs to the
  // previous day's night shift but loaded today. Both start blank rather than
  // on today, because prefilling would quietly get the night shift wrong.
  var loadPaired = true;
  var loadShiftDate = '';
  var loadDate = '';
  var loadTime = '';

  // ---- press / sleeve / loop ----
  // A bench makes one product at a time, and its cure and cavities come off
  // whichever is picked. A plant with only one product has it picked already.
  final onlyProduct = picksProduct && products.items.length == 1
      ? products.items.first
      : null;
  String? productId = onlyProduct?.id;
  final cyclicMin = TextEditingController(
    text: numText(onlyProduct?.cyclicMin),
  );
  final cavities = TextEditingController(text: numText(onlyProduct?.cavities));

  var busy = false;

  final started = await showAppSheet<bool>(
    context: context,
    title: isAutoclave ? 'Load ${machine.name}' : 'Start ${machine.name}',
    led: T.brand,
    body: (context, setSheetState) {
      final pickable = batches.pickable;

      /// The special line needs a batch to work through. With none open at all
      /// the sheet says so and offers nothing to fill in - a charge still in
      /// the vessel is offered, marked as such, so this is empty only when
      /// there is no batch on the floor.
      final nothingReady = special && pickable.isEmpty;

      /// Neither a press nor a sleeve bench can be started with nothing to
      /// make. The list has to have been read first: a connection that dropped
      /// is not an empty product list, and telling the crew to go and add one
      /// would send them after the wrong problem.
      final noProducts =
          picksProduct && products.loaded && products.items.isEmpty;

      final product = products.byId(productId);

      /// Cavities and a cycle time are facts about a mould, so an item that is
      /// cut rather than moulded is asked for neither.
      final productIsMoulded = product?.isMouldedItem ?? true;

      /// The number this run will be filed under, shown before it starts so the
      /// crew can see what it is about to be recorded as.
      final startBatchNo = isMouldingBench
          ? mouldingBatchNo(shiftDate: startDate, shift: startShift)
          : '';

      /// A coarse charge feeds the line for a shift; a special one opens a
      /// batch. Coarse and DRC open none: neither is worked through in grades.
      final loadIsCoarse = form?.type == 'coarse';

      /// The month letter a coarse number carries. Off the day the charge went
      /// in, which is the day it belongs to; the shift date stands in where the
      /// crew has not given the load its own.
      final loadLetter = loadIsCoarse
          ? monthLetter(
              loadDate.isNotEmpty
                  ? loadDate
                  : (loadShiftDate.isNotEmpty ? loadShiftDate : todayISO()),
            )
          : '';

      /// The loading time decides the shift, not the clock the sheet was opened
      /// at.
      final loadShift = shiftForTime(loadTime);

      /// A tap on the Batch grid.
      ///
      /// The first number picked is the batch being refined - the one the run
      /// is filed under, and the only one the record keys on. What is tapped
      /// after it goes through with it as tailings, which is what `sources`
      /// keeps. Two batches is what a refiner takes at a time; the special line
      /// records up to four, which is as many as its columns hold.
      ///
      /// Untapping the one it is filed under hands that job to the next number
      /// still lit rather than dropping the whole picking: the crew is taking
      /// one batch back off the machine, not starting the pick again.
      void tapBatch(Batch b) {
        final lead = batchNo.trim();
        if (lead == b.ref) {
          setSheetState(() {
            batchNo = mix.isEmpty ? '' : mix.first;
            mix = mix.skip(1).toList();
          });
          return;
        }
        if (mix.contains(b.ref)) {
          setSheetState(() => mix = mix.where((r) => r != b.ref).toList());
          return;
        }
        if (lead.isEmpty) {
          setSheetState(() {
            batchNo = b.ref;
            // The grade the batch was opened for is the one it will come off
            // at, so the picker starts there - the crew can still say
            // otherwise before it starts.
            if (special && b.grade != null) quality = b.grade!;
          });
          return;
        }
        if (!b.autoclaveDone) {
          // A charge is on this grid before it is out of the vessel, so that
          // the pick says why it is not ready rather than leaving the number
          // off the screen. It can still be the batch a run is filed under -
          // the crew see it through the door - but it has no tailings to put
          // through anything until it is discharged.
          ui.notify('${b.ref} is still in the autoclave', ToastKind.warn);
          return;
        }
        // Two batches is what a refiner takes at a time: the one it is filed
        // under and one more going through with it. The special line keeps the
        // four it has always recorded - four columns is what the record has
        // room for, and one of them is the batch being refined.
        if (mix.length >= (special ? 3 : 1)) {
          ui.notify(
            special ? 'Up to 4 batches per mix' : 'Two batches at a time',
            ToastKind.warn,
          );
          return;
        }
        setSheetState(() => mix = [...mix, b.ref]);
      }

      if (nothingReady) {
        // The special line has nothing to work on until a charge is out of the
        // vessel, so the sheet says what has to happen first rather than
        // offering a batch picker with nothing in it.
        return const EmptyState(
          icon: Icons.layers_rounded,
          title: 'Nothing to refine',
          hint:
              'No batch is open. Charge an autoclave on this tab to open one '
              '— a charge still cooking is offered here too, so this is empty '
              'only when there is no batch at all.',
        );
      }

      if (noProducts) {
        // A press moulds a product, and its cure, its mould and what its
        // compound costs all come off that product - so there is nothing to
        // fill in until one exists. A sleeve or loop bench needs one for the
        // same reasons and one more: the product is half the batch number.
        return EmptyState(
          icon: Icons.inventory_2_outlined,
          title: 'The product list is empty',
          hint: isMouldingBench
              ? 'Add what this bench makes before starting a run.'
              : 'Add what this press moulds before starting a run.',
        );
      }

      // ------------------------------------------------------- autoclave ----
      if (isAutoclave) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SheetLabel('Formulation'),
            if (forms.isEmpty)
              Hint(
                'No formulation is set up for a ${machine.capacity ?? '—'} kg '
                'vessel.',
              )
            else
              PickGrid(
                children: [
                  for (final f in forms)
                    Pick(
                      title: f.name,
                      subWidget: QualityChip(f.grade ?? 'Coarse'),
                      selected: form?.name == f.name,
                      onTap: () => setSheetState(() => form = f),
                    ),
                ],
              ),

            // Two hands charge both vessels between them, so a shared load
            // costs one worker and a solo load costs two.
            const SheetLabel('Loaded'),
            TwoWayPick(
              value: loadPaired,
              onChanged: (v) => setSheetState(() => loadPaired = v),
              onTitle: 'With another',
              onSub: '2 workers shared · 1 each',
              offTitle: 'Loaded alone',
              offSub: '2 workers',
            ),

            SheetLabel(
              loadIsCoarse ? 'Coarse batch number' : 'Batch number',
              note: loadIsCoarse && loadLetter.isNotEmpty
                  ? '— $loadLetter is '
                        '${monthShort(loadDate.isNotEmpty ? loadDate : (loadShiftDate.isNotEmpty ? loadShiftDate : todayISO()))}'
                  : null,
            ),
            _BatchNoField(
              // Starts a coarse number off with its month letter, so the crew
              // types the running number alone and cannot open one under last
              // month's letter on the 1st - the day it is easiest to get wrong
              // and hardest to notice.
              prefix: loadLetter.isEmpty ? '' : '$loadLetter-',
              value: batchNo,
              placeholder: loadIsCoarse
                  ? 'e.g. ${loadLetter.isEmpty ? 'C' : loadLetter}-2893'
                  : 'e.g. 2893',
              onChanged: (v) => setSheetState(() => batchNo = v),
            ),

            SheetLabel(
              'Shift date',
              note: loadIsCoarse ? null : '— the night shift keeps its start date',
            ),
            DateFieldRow(
              value: loadShiftDate,
              onChanged: (v) => setSheetState(() => loadShiftDate = v),
            ),
            FieldRow(
              left: DateFieldRow(
                label: 'Loading date',
                note: '— actual load day',
                value: loadDate,
                onChanged: (v) => setSheetState(() => loadDate = v),
              ),
              right: TimeFieldRow(
                label: 'Loading time',
                note: '— blank = now',
                value: loadTime,
                onChanged: (v) => setSheetState(() => loadTime = v),
              ),
            ),
            Hint(
              'Shift: $loadShift — taken from the loading time'
              '${loadTime.isEmpty ? ', now' : ''}. The shift date above can '
              'differ from the loading date.',
            ),
          ],
        );
      }

      // ------------------------------------ press, sleeve and loop benches ---
      if (picksProduct) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isMouldingBench) ...[
              // The number leads, because it is the one thing on this sheet the
              // crew cannot change and the thing their output will be found
              // under afterwards.
              const SheetLabel('Batch number'),
              Readout(
                label: startBatchNo.isNotEmpty
                    ? 'This run will be recorded as'
                    : 'Not decided yet',
                value: startBatchNo.isNotEmpty
                    ? startBatchNo
                    : '— pick a date and a shift',
                valueColour: T.brand,
              ),
              const Hint(
                'Generated from the date and the shift — it is not typed and '
                'cannot be changed. The lot is this number and the product '
                'together, so sleeve and loop on one shift share the number and '
                'stay separate lots. A second run of the same product in this '
                'shift joins this same lot rather than opening another.',
              ),
            ],

            const SheetLabel('Product'),
            if (products.items.isEmpty)
              const Hint('Reading the product list…')
            else
              PickGrid(
                children: [
                  for (final p in products.items)
                    Pick(
                      title: p.name,
                      sub: isMouldingBench
                          ? [
                              p.pieceKg != null
                                  ? '${p.pieceKg} kg each'
                                  : 'unit weight not set',
                              if (p.moulded == false) 'not moulded',
                              if (p.cavities != null) '${p.cavities} cav',
                            ].join(' · ')
                          : ([
                              if (p.cureTempC != null) '${p.cureTempC} °C',
                              if (p.cyclicMin != null) '${p.cyclicMin} min',
                              if (p.cavities != null) '${p.cavities} cav',
                            ].join(' · ').isEmpty
                                ? 'settings not set yet'
                                : [
                                    if (p.cureTempC != null) '${p.cureTempC} °C',
                                    if (p.cyclicMin != null) '${p.cyclicMin} min',
                                    if (p.cavities != null) '${p.cavities} cav',
                                  ].join(' · ')),
                      selected: productId == p.id,
                      onTap: () => setSheetState(() {
                        productId = p.id;
                        cyclicMin.text = numText(p.cyclicMin);
                        cavities.text = numText(p.cavities);
                      }),
                    ),
                ],
              ),

            // A fact of the product, not a decision at the run.
            if (product != null)
              isMouldingBench
                  ? Readout(
                      label: 'Unit weight',
                      value: orNotSet(product.pieceKg, 'kg a piece'),
                      valueColour: T.steel,
                    )
                  : Readout(
                      label: 'Curing temperature',
                      value: orNotSet(product.cureTempC, '°C'),
                      valueColour: T.ember,
                    ),

            if (productIsMoulded)
              FieldRow(
                left: TextFieldRow(
                  controller: cyclicMin,
                  label: 'Cyclic time',
                  note: '— from the product',
                  suffix: 'min',
                  decimal: true,
                  placeholder: product?.cyclicMin != null
                      ? numText(product!.cyclicMin)
                      : 'not set',
                ),
                right: TextFieldRow(
                  controller: cavities,
                  label: 'Cavities',
                  note: '— change if a different mould is on',
                  integer: true,
                  placeholder: product?.cavities != null
                      ? numText(product!.cavities)
                      : 'not set',
                ),
              ),

            FieldRow(
              left: DateFieldRow(
                label: 'Date',
                note: isMouldingBench
                    ? '— the night shift keeps its start date'
                    : null,
                value: startDate,
                onChanged: (v) => setSheetState(() => startDate = v),
              ),
              right: SelectFieldRow<String>(
                label: 'Shift',
                value: startShift,
                items: [for (final s in shifts) (value: s, label: s)],
                onChanged: (v) =>
                    setSheetState(() => startShift = v ?? currentShift()),
              ),
            ),

            if (!isMouldingBench && product?.compoundRate == null)
              Hint(
                'No compound rate is set against ${product?.name ?? 'this '
                    'product'} yet, so the run will log without a material '
                'cost. It can be costed once the rate is entered.',
              ),
            if (isMouldingBench &&
                productIsMoulded &&
                (product?.cyclicMin == null || product?.cavities == null))
              Hint(
                'No cycle time or cavities against '
                '${product?.name ?? 'this product'} yet, so the run will log '
                'without an expected piece count to compare against. Enter them '
                'here for this run, or on the product list for good.',
              ),
          ],
        );
      }

      // ------------------------------- refiners, grinders and coarse lines ---
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (picksBatch && pickable.isNotEmpty) ...[
            SheetLabel(
              'Batch',
              note: mix.isEmpty ? '— tap a second to mix one in' : null,
            ),
            PickGrid(
              children: [
                for (final b in pickable)
                  Pick(
                    title: b.ref,
                    mono: true,
                    dot: b.grade == null ? null : qualityColour[b.grade],
                    subWidget: _BatchPickSub(b),
                    selected: batchNo == b.ref || mix.contains(b.ref),
                    onTap: () => tapBatch(b),
                  ),
              ],
            ),
            // Which of the lit tiles the run is actually filed under. Two
            // tiles lit the same way say nothing about that, and the one it is
            // filed under is the one the batch card, the weighing and the
            // costing all follow.
            if (mix.isNotEmpty)
              Hint(
                'Filed under ${batchNo.trim()} — '
                '${mix.join(' and ')} ${mix.length == 1 ? 'goes' : 'go'} '
                'through with it as tailings.',
              ),
          ],

          if (machine.needsQuality || special) ...[
            const SheetLabel('Quality'),
            PickGrid(
              children: [
                for (final q in qualities)
                  Pick(
                    title: q,
                    dot: qualityColour[q],
                    selected: quality == q,
                    onTap: () => setSheetState(() => quality = q),
                  ),
              ],
            ),
          ],

          if (!shiftwise)
            _BatchNoField(
              label: 'Batch',
              note: picksBatch ? '— or type it' : '— optional',
              value: batchNo,
              placeholder: 'e.g. B-104',
              onChanged: (v) => setSheetState(() {
                batchNo = v;
                mix = mix.where((ref) => ref != v.trim()).toList();
              }),
            ),

          // A special-line pass that yields nothing to weigh is rare enough
          // that it is said out loud rather than inferred at stop time.
          if (special) ...[
            const SheetLabel('Run type'),
            TwoWayPick(
              value: !nonProd,
              onChanged: (v) => setSheetState(() => nonProd = !v),
              onTitle: 'Production',
              onSub: 'default · weigh the output',
              offTitle: 'Non-production',
              offSub: 'no weighing · rare',
            ),
          ],

          if (shiftwise) ...[
            const SheetLabel('Date'),
            DateFieldRow(
              value: startDate,
              onChanged: (v) => setSheetState(() => startDate = v),
            ),
            const SheetLabel('Shift'),
            PickGrid(
              children: [
                for (final s in shifts)
                  Pick(
                    title: s,
                    sub: shiftHours[s],
                    selected: startShift == s,
                    onTap: () => setSheetState(() => startShift = s),
                  ),
              ],
            ),
          ] else if (metered)
            FieldRow(
              left: DateFieldRow(
                label: 'Date',
                value: startDate,
                onChanged: (v) => setSheetState(() => startDate = v),
              ),
              right: SelectFieldRow<String>(
                label: 'Shift',
                value: startShift,
                items: [for (final s in shifts) (value: s, label: s)],
                onChanged: (v) =>
                    setSheetState(() => startShift = v ?? currentShift()),
              ),
            ),

          if (machine.tyre) ...[
            const SheetLabel('Tyre feedstock'),
            PickGrid(
              children: [
                for (final entry in tyres.entries)
                  Pick(
                    title: entry.value.label,
                    sub: '${entry.value.mesh} crumb',
                    selected: tyre == entry.key,
                    onTap: () => setSheetState(() => tyre = entry.key),
                  ),
              ],
            ),
          ],

          if (metered) ...[
            const SizedBox(height: 14),
            TextFieldRow(
              controller: elecStart,
              label: 'Initial electricity reading',
              note: previous?.elecEnd != null
                  ? '— last end ${previous!.elecEnd}'
                  : '— meter units now',
              suffix: 'units',
              decimal: true,
              placeholder: 'meter reading',
            ),
            TextFieldRow(
              controller: hourStart,
              label: 'Hour-meter reading at start',
              note: previous?.hourEnd != null
                  ? '— last end ${previous!.hourEnd}'
                  : null,
              suffix: 'hrs',
              decimal: true,
              placeholder: 'hour meter now',
            ),
          ],
        ],
      );
    },
    actions: (context, setSheetState) {
      final nothingReady = special && batches.pickable.isEmpty;
      final noProducts =
          picksProduct && products.loaded && products.items.isEmpty;

      if (nothingReady || noProducts) {
        return [
          AppButton(
            label: 'Close',
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ];
      }

      return [
        AppButton(
          label: 'Cancel',
          onPressed: busy ? null : () => Navigator.of(context).pop(false),
        ),
        AppButton(
          label: isAutoclave ? 'Load ▸' : 'Start ▸',
          variant: ButtonVariant.primary,
          loading: busy,
          onPressed: busy
              ? null
              : () async {
                  // One sheet action at a time. The tablets are slow enough
                  // that a reply takes a visible moment, and a crew in gloves
                  // taps a button that has not answered again - which is how a
                  // machine ends up with seven runs open at once. The server
                  // and the database both refuse the second start now, but
                  // neither turns the extra taps back into one run: only not
                  // sending them does that.
                  setSheetState(() => busy = true);
                  final okay = isAutoclave
                      ? await _confirmLoad(
                          machine: machine,
                          form: form,
                          batchNo: batchNo,
                          loadPaired: loadPaired,
                          loadShiftDate: loadShiftDate,
                          loadDate: loadDate,
                          loadTime: loadTime,
                          batches: batches,
                          runs: runs,
                          ui: ui,
                        )
                      : await _confirmStart(
                          machine: machine,
                          line: line,
                          shiftwise: shiftwise,
                          special: special,
                          picksBatch: picksBatch,
                          metered: metered,
                          picksProduct: picksProduct,
                          isMouldingBench: isMouldingBench,
                          quality: quality,
                          batchNo: batchNo,
                          mix: mix,
                          startDate: startDate,
                          startShift: startShift,
                          nonProd: nonProd,
                          tyre: tyre,
                          elecStart: elecStart.text,
                          hourStart: hourStart.text,
                          productId: productId,
                          products: products,
                          cyclicMin: cyclicMin.text,
                          cavities: cavities.text,
                          batches: batches,
                          runs: runs,
                          ui: ui,
                        );
                  setSheetState(() => busy = false);
                  if (okay && context.mounted) {
                    Navigator.of(context).pop(true);
                  }
                },
        ),
      ];
    },
  );

  elecStart.dispose();
  hourStart.dispose();
  cyclicMin.dispose();
  cavities.dispose();
  return started;
}

/// Charging an autoclave.
///
/// A special load opens the batch the refiners will work through, then starts
/// the run against it. A coarse or DRC load only starts the run: neither is
/// worked through in grades, so both are counted by their runs and never become
/// a batch. The run is not started if the batch could not be opened, because a
/// load running against a batch that does not exist is worse than no load.
Future<bool> _confirmLoad({
  required Machine machine,
  required AutoclaveForm? form,
  required String batchNo,
  required bool loadPaired,
  required String loadShiftDate,
  required String loadDate,
  required String loadTime,
  required BatchesStore batches,
  required RunsStore runs,
  required UiStore ui,
}) async {
  final ref = batchNo.trim();
  final loadIsCoarse = form?.type == 'coarse';

  if (form == null) {
    ui.notify('Pick a formulation', ToastKind.warn);
    return false;
  }
  if (loadShiftDate.isEmpty) {
    ui.notify(
      loadIsCoarse ? 'Pick a date' : 'Pick a shift date',
      ToastKind.warn,
    );
    return false;
  }
  if (ref.isEmpty) {
    ui.notify(
      loadIsCoarse ? 'Enter a coarse batch number' : 'Enter a batch number',
      ToastKind.warn,
    );
    return false;
  }
  // A quick answer for the number the crew can already see on this tablet. The
  // server checks it against every batch on record, open or closed, and is the
  // one that has the last word.
  if (batches.items.any((b) => b.ref.toLowerCase() == ref.toLowerCase())) {
    ui.notify('Batch $ref already exists', ToastKind.warn);
    return false;
  }

  // The load date is the day the charge actually went in, which is not always
  // the shift's date; with no date of its own it falls back to the shift's.
  final startedAt = atLocal(
    loadDate.isNotEmpty ? loadDate : loadShiftDate,
    loadTime,
  );
  final loadShift = shiftForTime(loadTime);

  if (opensBatch(form)) {
    final error = await batches.create({
      'machine_id': machine.id,
      'ref': ref,
      'formulation': form.name,
      'capacity': machine.capacity ?? form.capacity,
      // Whether the crew was shared with the twin vessel, and the shift the
      // charge belongs to - which is the loading time's shift, not the clock's,
      // and can sit on a different date from the shift date.
      'paired': loadPaired,
      'shift': loadShift,
      'shift_date': loadShiftDate,
    });
    if (error != null) {
      ui.notify(error, ToastKind.err);
      return false;
    }
  }

  final run = await runs.start({
    'machineId': machine.id,
    // A coarse charge is shiftwise output; a special one is a batch, and the
    // server reads the line off the machine for it.
    'line': loadIsCoarse ? 'coarse' : null,
    'batchNo': ref,
    'formulation': form.name,
    // The grade is settled at the refiner, not at the autoclave.
    'quality': null,
    'paired': loadPaired,
    'workers': autoclaveWorkers(loadPaired),
    'shiftDate': loadShiftDate,
    'shift': loadShift,
    'supervisor': ui.supervisorName.isEmpty ? null : ui.supervisorName,
    if (startedAt != null) 'startedAt': startedAt,
  });

  if (run == null) return false;
  ui.notify('${machine.name} loaded · ${form.name} · $ref');
  await batches.fetchOpen();
  return true;
}

Future<bool> _confirmStart({
  required Machine machine,
  required String? line,
  required bool shiftwise,
  required bool special,

  /// Whether this sheet refines a named batch - a refiner or the special line.
  /// Both may have had more than one batch going through them; see [mix].
  required bool picksBatch,
  required bool metered,
  required bool picksProduct,
  required bool isMouldingBench,
  required String quality,
  required String batchNo,
  required List<String> mix,
  required String startDate,
  required String startShift,
  required bool nonProd,
  required String? tyre,
  required String elecStart,
  required String hourStart,
  required String? productId,
  required ProductsStore products,
  required String cyclicMin,
  required String cavities,
  required BatchesStore batches,
  required RunsStore runs,
  required UiStore ui,
}) async {
  // None of the three product benches has meters, but each is still started for
  // a named shift. On a sleeve or loop run those two are not only context -
  // together with the product they *are* the batch number.
  if (picksProduct) {
    if (startDate.isEmpty) {
      ui.notify('Pick a date', ToastKind.warn);
      return false;
    }
    if (productId == null || productId.isEmpty) {
      ui.notify(
        isMouldingBench ? 'Pick what it is making' : 'Pick what it is moulding',
        ToastKind.warn,
      );
      return false;
    }
    // The number the run will be filed under has to exist before it starts. It
    // cannot be typed and cannot be corrected afterwards without moving the
    // lot, so a sheet that cannot form one is stopped here.
    if (isMouldingBench &&
        mouldingBatchNo(shiftDate: startDate, shift: startShift).isEmpty) {
      ui.notify(
        'No batch number can be made — check the date and the shift',
        ToastKind.warn,
      );
      return false;
    }
    final cav = asNumber(cavities);
    if (cav != null && (cav <= 0 || cav != cav.roundToDouble())) {
      ui.notify('Cavities must be a whole number above zero', ToastKind.warn);
      return false;
    }
    final cyc = asNumber(cyclicMin);
    if (cyc != null && cyc <= 0) {
      ui.notify('Cyclic time must be more than zero', ToastKind.warn);
      return false;
    }
  }

  // A meter reading is optional, but a zero or negative one is a mis-key rather
  // than a meter that has never turned - the same rule the back office applies
  // when it turns the pair into kWh and hours.
  num? elec;
  num? hour;
  if (metered) {
    if (startDate.isEmpty) {
      ui.notify('Pick a date', ToastKind.warn);
      return false;
    }
    if (elecStart.trim().isNotEmpty) {
      elec = num.tryParse(elecStart.trim());
      if (elec == null || elec <= 0) {
        ui.notify(
          'Initial electricity reading must be greater than zero',
          ToastKind.warn,
        );
        return false;
      }
    }
    if (hourStart.trim().isNotEmpty) {
      hour = num.tryParse(hourStart.trim());
      if (hour == null || hour <= 0) {
        ui.notify(
          'Initial hour-meter reading must be greater than zero',
          ToastKind.warn,
        );
        return false;
      }
    }
  }

  // The special line refines a named batch - there is nothing to run it against
  // otherwise, and the grade would belong to nothing.
  if (special && batchNo.trim().isEmpty) {
    ui.notify('Pick the batch it is refining', ToastKind.warn);
    return false;
  }

  // Only when the batch was picked rather than typed - a typed number the plant
  // has no open batch for has nothing to copy off it.
  Batch? picked;
  for (final b in batches.items) {
    if (b.ref == batchNo.trim()) picked = b;
  }

  final product = products.byId(productId);

  final run = await runs.start({
    'machineId': machine.id,
    // Null lets the server derive the line from the machine's kind, which is
    // right for every machine that only ever runs one of them.
    'line': line,
    // A machine with a grade of its own is told which one, and so is a
    // coarse-line machine turned onto the special line.
    'quality': (machine.needsQuality || special) ? quality : null,
    // A shiftwise machine runs whatever the line feeds it, so it carries no
    // batch of its own - and neither does a press. A sleeve or loop run does
    // carry one and deliberately does not send it: the server generates the
    // number, so a tablet cannot name the lot its pieces land in.
    'batchNo': (shiftwise || picksProduct)
        ? null
        : (batchNo.trim().isEmpty ? null : batchNo.trim()),
    'formulation': (shiftwise || picksProduct) ? null : picked?.formulation,
    'tyreType': machine.tyre ? tyre : null,
    'mesh': machine.tyre && tyre != null ? tyres[tyre]?.mesh : null,
    'shiftDate': (metered || picksProduct) ? startDate : todayISO(),
    'shift': (metered || picksProduct) ? startShift : currentShift(),
    'supervisor': ui.supervisorName.isEmpty ? null : ui.supervisorName,
    'elecStart': elec,
    'hourStart': hour,
    // What it is making, and the two settings the floor may change for this
    // run. The temperature and the compound rate are the product's, and the
    // server copies both off it.
    if (picksProduct) ...{
      'product': productId,
      'cyclicMin': asNumber(cyclicMin),
      'cavities': asNumber(cavities),
    },
    if (special) 'nonProduction': nonProd,
    // The batch being refined leads the list; the tailings mixed into it
    // follow. Sent only when there is a mix - a batch on its own is already
    // named by `batchNo`.
    if (picksBatch && mix.isNotEmpty) 'sources': [batchNo.trim(), ...mix],
  });

  if (run == null) return false;

  final startBatchNo = mouldingBatchNo(
    shiftDate: startDate,
    shift: startShift,
  );

  /// What the toast says after the machine's name: the one thing the crew has
  /// just decided that a look at the running machine would not tell them back.
  final String detail;
  if (shiftwise) {
    detail = ' · $startShift${tyre != null ? ' · ${tyres[tyre]!.label}' : ''}';
  } else if (isMouldingBench) {
    // The number it will be recorded under and what it is making, said back to
    // the crew - either alone names a lot only halfway.
    detail = ' · $startBatchNo · ${product?.name ?? productId}';
  } else if (picksProduct) {
    detail = ' · ${product?.name ?? productId}';
  } else {
    // A refiner refines a named batch as much as the special line does, and
    // the crew has just picked it off a grid of open numbers - saying it back
    // is the confirmation that the run went on the batch they meant rather
    // than the one beside it. The mix is said for the same reason again: two
    // batches picked is two batches said back.
    final batch = batchNo.trim();
    detail =
        '${batch.isEmpty ? '' : ' · $batch'}'
        '${special ? ' · special line' : ''}'
        '${special && nonProd ? ' · non-production' : ''}'
        '${mix.isNotEmpty ? ' · mixed with ${mix.length}' : ''}';
  }
  ui.notify('${machine.name} started$detail');
  return true;
}

/// The two lines under a batch number on the Batch pick.
///
/// The first says what the charge is - the formulation it was cooked to and the
/// grade that has come off it so far. The crew used to type the grade into the
/// batch number itself to get it onto this tile ("3084 special drc"), which put
/// it in the one field the whole record is keyed on.
///
/// The second says where the batch has got to: when PR2 broke it down and when
/// R1 first went on it. A stage that has not run reads the dash [clock24] gives
/// back rather than being left off, because the gap IS the answer - it is how
/// the pick says this one has not been through the pre-refiner yet. A charge
/// still in the vessel has no stage times to give and says so instead.
class _BatchPickSub extends StatelessWidget {
  const _BatchPickSub(this.batch);

  final Batch batch;

  @override
  Widget build(BuildContext context) {
    final what = [
      batch.formulation,
      batch.grade,
    ].where((s) => s != null && s.isNotEmpty).join(' · ');
    final stages = batchPickStages
        .map((id) => '$id ${clock24(batch.openedOn[id])}')
        .join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          what.isEmpty ? 'no grade marked yet' : what,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
        ),
        const SizedBox(height: 2),
        Text(
          batch.autoclaveDone ? stages : 'in autoclave',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 10.5,
            // Monospaced so the times line up down the grid rather than
            // jittering with the width of each number.
            fontFamily: batch.autoclaveDone ? 'monospace' : null,
            color: T.inkDim,
          ),
        ),
      ],
    );
  }
}

/// A batch-number field with an optional month-letter prefix already in it.
///
/// The prefix is only ever written over an empty field or a bare prefix, which
/// is what keeps it from fighting the crew: once there is a number after the
/// letter the field is theirs, and a coarse charge back-dated into another
/// month is left exactly as typed rather than being renumbered under them.
class _BatchNoField extends StatefulWidget {
  const _BatchNoField({
    required this.value,
    required this.onChanged,
    this.prefix = '',
    this.label,
    this.note,
    this.placeholder,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String prefix;
  final String? label;
  final String? note;
  final String? placeholder;

  @override
  State<_BatchNoField> createState() => _BatchNoFieldState();
}

class _BatchNoFieldState extends State<_BatchNoField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.value,
  );

  @override
  void didUpdateWidget(covariant _BatchNoField old) {
    super.didUpdateWidget(old);

    // Picking a batch off the grid above fills this in - the two are one
    // answer, and a picker that leaves the field showing the previous number is
    // a sheet saying two things at once.
    if (widget.value != old.value && widget.value != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
      return;
    }

    if (widget.prefix.isNotEmpty && widget.prefix != old.prefix) {
      if (RegExp(r'^[A-La-l]?-?$').hasMatch(_controller.text)) {
        _controller.text = widget.prefix;
        widget.onChanged(widget.prefix);
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextFieldRow(
    controller: _controller,
    label: widget.label,
    note: widget.note,
    placeholder: widget.placeholder,
    onChanged: widget.onChanged,
  );
}
