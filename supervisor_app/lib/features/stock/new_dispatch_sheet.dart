import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../services/services.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/sheet.dart';
import '../../widgets/ui.dart';

/// What the sheet needs off a stock group, and no more.
///
/// Its own shape rather than a [StockSummaryRow] so the sheet cannot come to
/// depend on the commercial half of the yard - what was packed and what has
/// already gone - which is the back office's reconciliation and none of this
/// form's business. (This app is not sent it either way: it reads
/// `/stock/summary`.)
class DispatchableStock {
  const DispatchableStock({
    required this.id,
    required this.label,
    required this.quality,
    required this.unit,
    required this.availableQty,
    required this.qcStatus,
    this.packSize,
  });

  final String id;
  final String label;
  final String? quality;

  /// What this group is counted in. Nothing in this sheet prints a quantity
  /// without the unit beside it, because a moulded pallet shown as sacks is a
  /// price per sack typed against goods sold by the piece.
  final String unit;
  final num availableQty;
  final String qcStatus;

  /// Pieces to a pack, so the picker can say how many boxes that is.
  final int? packSize;
}

/// One line of the document. The line has no id until it is posted, so [key] is
/// a local one that only has to be unique while the sheet is open.
class _Line {
  _Line(this.key, {this.stockGroupId = ''});
  final int key;
  String stockGroupId;

  /// The count going out, in the group's own unit - sacks or pieces.
  String qty = '';
}

/// Issuing a dispatch, from the Stock view.
///
/// The header says who it is going to and on what day, and whether we carried
/// it; the lines say what came off which stock group and how much. Only groups
/// with stock left and a QC pass can be picked - the rest are on the screen
/// behind this sheet with the reason they cannot be loaded, which is a
/// different thing from being hidden.
///
/// Two parts are worth reading closely.
///
/// The price is per quality, not per line. A customer is quoted a rate for Fine
/// and every sack of Fine on the document goes at it, so the prices sit in
/// their own block keyed on the qualities the lines actually add up to. That
/// block grows and shrinks as stock is picked, and the sheet will not submit
/// while any of it is blank: a quality left unpriced is the load that goes out
/// at last quarter's figure and is noticed on the invoice.
///
/// The loading job is costed here rather than remembered to be entered later.
/// Its "daily labour on this load?" section is always shown, on every load,
/// including a contract one - because the rule is that any day-labour worker's
/// time is accounted in man-hours wherever they worked, and a section that only
/// appears once someone has chosen the right mode is a section nobody finds.
///
/// A port of client/src/features/dispatch/NewDispatchSheet.tsx. Returns true
/// when a document was actually posted, so the yard behind it can reload.
Future<bool?> showNewDispatchSheet({
  required BuildContext context,
  required List<DispatchableStock> groups,
  String? initialGroupId,
}) async {
  final ui = context.read<UiStore>();
  final customerService = context.read<CustomerService>();
  final rateService = context.read<RateService>();
  final dispatchService = context.read<DispatchService>();

  // Only what can actually be loaded: stock left, and the lab has passed it.
  // The sheet is handed every group in the yard and picks here, rather than
  // being handed a pre-filtered list - that way one rule decides what may go on
  // a vehicle and it is written where the form can also say why about the rest.
  final loadable = groups
      .where((g) => g.availableQty > 0 && g.qcStatus == 'pass')
      .toList();
  final byId = {for (final g in groups) g.id: g};

  var customers = <Customer>[];
  var lastPrices = <String, num>{};
  var rates = (perKg: 0 as num, perHour: 0 as num);

  /// The sheet body is rebuilt on every keystroke, so the two reads it opens
  /// with are fired once and guarded rather than re-fired each frame.
  var loadedOnce = false;

  String? customerId;
  var date = todayISO();
  var transportProvided = false;
  final transportCharge = TextEditingController();
  final remarks = TextEditingController();
  var lines = <_Line>[
    _Line(1, stockGroupId: initialGroupId ?? ''),
  ];
  final prices = <String, TextEditingController>{};

  // -- the loading job -----------------------------------------------------
  var material = 'reclaim';
  final kgLoaded = TextEditingController();
  final labourers = TextEditingController();
  final hours = TextEditingController();
  final vehicleNo = TextEditingController();

  var posting = false;
  String? formError;

  /// The group label the server refused, so its line can carry the reason.
  ({String label, String message})? rejected;

  final posted = await showAppSheet<bool>(
    context: context,
    title: 'Issue a dispatch',
    subtitle:
        'Only stock with something left and a QC pass can be loaded. Every '
        'quality on the document needs a selling price before it can go.',
    led: T.elec,
    body: (context, setSheetState) {
      // Loaded once, when the sheet first draws.
      if (customers.isEmpty && !loadedOnce) {
        loadedOnce = true;
        () async {
          try {
            final rows = await customerService.list();
            setSheetState(() => customers = rows);
          } on ApiException catch (e) {
            ui.notify(e.message, ToastKind.err);
          }
          // The two loading rates, for the running total below. The figures
          // that end up on the record are read again on the server and
          // snapshotted there, so a stale copy here cannot become a stale cost
          // on the document. Off `loading-rates` rather than the full cost
          // table, which is the back office's: a supervisor needing to see what
          // a lorry costs to load is no reason to hand them the plant's
          // overheads and interest rate.
          try {
            final r = await rateService.loadingRates();
            setSheetState(() => rates = r);
          } on ApiException {
            // The form still works without them - it shows the loading cost as
            // nothing rather than refusing to open.
          }
        }();
      }

      num? asNum(String v) => num.tryParse(v.trim());

      /// The qualities actually on the document - what has to carry a price -
      /// and what each is sold by. The unit rides along because the price is
      /// per unit and the two must be read together: "Rs 44" against LOOP means
      /// forty-four rupees a loop, and a field labelled per sack would be the
      /// same number meaning something else entirely.
      final qualities = <({String quality, String unit})>[];
      final seen = <String>{};
      for (final line in lines) {
        final group = byId[line.stockGroupId];
        final q = group?.quality;
        if (q != null && seen.add(q)) {
          qualities.add((quality: q, unit: group!.unit));
        }
      }

      // A quality that arrives on the document gets what this customer last
      // paid filled in - only ever into a blank, because a figure already typed
      // is the one somebody chose and the whole point of showing the price is
      // that it is never applied behind their back.
      for (final q in qualities) {
        final controller = prices.putIfAbsent(
          q.quality,
          () => TextEditingController(),
        );
        if (controller.text.trim().isEmpty && lastPrices[q.quality] != null) {
          controller.text = numText(lastPrices[q.quality]);
        }
      }

      num priceOf(String? quality) => quality == null
          ? 0
          : (asNum(prices[quality]?.text ?? '') ?? 0);

      num lineTotal(_Line line) {
        final quality = byId[line.stockGroupId]?.quality;
        return round2((asNum(line.qty) ?? 0) * priceOf(quality));
      }

      // Only the bagged lines. A moulded piece is not a sack and adding the two
      // would put a moulded load on the weighbridge at fifty kilos a loop.
      num totalSacks = 0;
      for (final line in lines) {
        if (byId[line.stockGroupId]?.unit == 'sacks') {
          totalSacks += asNum(line.qty) ?? 0;
        }
      }
      final goodsTotal = round2(
        lines.fold<num>(0, (sum, line) => sum + lineTotal(line)),
      );
      final transport = transportProvided
          ? (asNum(transportCharge.text) ?? 0)
          : 0;

      final defaultKg = round2(totalSacks * sackKg);
      final contractKg = material == 'moulded'
          ? 0
          : (asNum(kgLoaded.text) ?? defaultKg);
      final crew = asNum(labourers.text) ?? 0;
      final worked = asNum(hours.text) ?? 0;

      // What the entry will actually be stored as - the same derivation the
      // server runs, shown here so the mode is never a surprise on the way
      // back. Moulded goods have no per-kg contract behind them, so they are
      // man-hour and nothing else.
      final mode = material == 'moulded'
          ? 'manhour'
          : !(crew > 0 && worked > 0)
          ? 'contract'
          : contractKg > 0
          ? 'mixed'
          : 'manhour';
      final contractCost = (mode == 'contract' || mode == 'mixed')
          ? round2(contractKg * rates.perKg)
          : 0;
      final manhourCost = (mode == 'manhour' || mode == 'mixed')
          ? round2(crew * worked * rates.perHour)
          : 0;
      final loadingCost = round2(contractCost + manhourCost);
      final grandTotal = round2(goodsTotal + transport);

      const modeLabel = {
        'contract': 'Contract',
        'manhour': 'Daily wage (man-hours)',
        'mixed': 'Mixed — contract plus daily labour',
      };

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SheetLabel('Who and when'),
          SelectFieldRow<String>(
            label: 'Customer',
            value: customerId,
            placeholder: 'Pick a customer…',
            items: [
              for (final c in customers) (value: c.id, label: c.name),
            ],
            onChanged: (value) {
              customerId = value;
              formError = null;
              // What they last paid, per quality. Reloaded whenever the
              // customer changes, so the prefill is always this customer's
              // history and never the previous one's.
              if (value != null) {
                customerService
                    .lastPrices(value)
                    .then((p) => setSheetState(() => lastPrices = p))
                    .catchError((Object _) => <String, num>{});
              } else {
                lastPrices = {};
              }
              setSheetState(() {});
            },
          ),
          FieldRow(
            left: DateFieldRow(
              label: 'Dispatch date',
              value: date,
              onChanged: (v) => setSheetState(() => date = v),
            ),
            right: SelectFieldRow<bool>(
              label: 'Transportation',
              value: transportProvided,
              items: const [
                (value: false, label: "Customer's own"),
                (value: true, label: 'We provided it'),
              ],
              onChanged: (v) =>
                  setSheetState(() => transportProvided = v ?? false),
            ),
          ),
          if (transportProvided)
            TextFieldRow(
              controller: transportCharge,
              label: 'Transport charge',
              note: 'added to the total',
              suffix: 'Rs',
              decimal: true,
              placeholder: '0',
              onChanged: (_) => setSheetState(() {}),
            ),

          const SheetLabel('What is going out'),
          for (var i = 0; i < lines.length; i++)
            Builder(
              builder: (_) {
                final line = lines[i];
                final group = byId[line.stockGroupId];
                final refused =
                    rejected != null &&
                    group != null &&
                    group.label == rejected!.label;
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    border: Border.all(color: T.line),
                    borderRadius: BorderRadius.circular(T.radiusSm),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Line ${i + 1}',
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: T.inkFaint,
                            ),
                          ),
                          const Spacer(),
                          if (lines.length > 1)
                            AppButton(
                              dense: true,
                              label: 'Remove',
                              onPressed: posting
                                  ? null
                                  : () => setSheetState(
                                      () => lines.removeAt(i),
                                    ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      SelectFieldRow<String>(
                        label: 'Stock',
                        value: line.stockGroupId.isEmpty
                            ? null
                            : line.stockGroupId,
                        placeholder:
                            'Pick a batch, a coarse pool or a moulded pack…',
                        items: [
                          for (final o in loadable)
                            (
                              value: o.id,
                              label:
                                  '${o.label} · ${o.quality ?? '—'} · '
                                  '${counted(o.availableQty, o.unit)} left',
                            ),
                        ],
                        onChanged: (v) => setSheetState(() {
                          rejected = null;
                          line.stockGroupId = v ?? '';
                        }),
                      ),
                      _QtyField(
                        // Keyed on the line rather than its position, so
                        // removing line 1 of 2 does not leave the survivor
                        // wearing the deleted line's quantity.
                        key: ValueKey(line.key),
                        line: line,
                        group: group,
                        onChanged: (v) => setSheetState(() {
                          rejected = null;
                          line.qty = v;
                        }),
                      ),
                      if (group != null)
                        Readout(
                          label: group.label,
                          labelWidget: Row(
                            children: [
                              QualityChip(group.quality ?? 'Coarse'),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  group.label,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: T.inkFaint,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          value: rupees(lineTotal(line)),
                        ),
                      if (refused) FormWarning([rejected!.message]),
                    ],
                  ),
                );
              },
            ),
          AppButton(
            label: '+ Add a line',
            expand: true,
            onPressed: posting || loadable.isEmpty
                ? null
                : () => setSheetState(
                    () => lines.add(
                      _Line(DateTime.now().microsecondsSinceEpoch),
                    ),
                  ),
          ),

          // One figure per quality, not per line. Two pallets of Fine off two
          // different batches go out at the same rate, because that is what the
          // customer was quoted.
          const SheetLabel('Selling price per quality'),
          if (qualities.isEmpty)
            const Hint(
              'Pick some stock and its qualities appear here to price.',
            )
          else
            for (final q in qualities)
              TextFieldRow(
                controller: prices[q.quality]!,
                label: q.quality,
                note: lastPrices[q.quality] != null
                    ? 'last ${rupees(lastPrices[q.quality])}'
                    : 'no history',
                // Per whatever this quality is sold by. Reclaim goes by the
                // sack and moulded goods by the piece, and the same figure
                // means two very different sums depending on which.
                suffix: 'Rs / ${(unitNoun[q.unit] ?? unitNoun['sacks']!).one}',
                decimal: true,
                onChanged: (_) => setSheetState(() => rejected = null),
              ),

          // The loading job. The daily-labour block is shown on every load,
          // contract ones included: any day-labour worker's time has to be
          // accounted in man-hours wherever they worked, and a block that only
          // appears after someone picks the right mode is a block nobody finds.
          const SheetLabel('Loading'),
          FieldRow(
            left: SelectFieldRow<String>(
              label: 'Material',
              value: material,
              items: const [
                (value: 'reclaim', label: 'Reclaim / coarse'),
                (value: 'moulded', label: 'Moulded goods'),
              ],
              onChanged: (v) => setSheetState(() => material = v ?? 'reclaim'),
            ),
            right: TextFieldRow(
              controller: vehicleNo,
              label: 'Vehicle no.',
              note: 'opt.',
              upperCase: true,
            ),
          ),
          // Moulded goods have no per-kg contract behind them, so the contract
          // half is not offered for them rather than being offered and ignored.
          if (material != 'moulded')
            TextFieldRow(
              controller: kgLoaded,
              label: 'Kg loaded',
              note:
                  'contract at ${rupees(rates.perKg)}/kg · blank = $defaultKg '
                  'kg from the sacks',
              suffix: 'kg',
              decimal: true,
              placeholder: numText(defaultKg),
              onChanged: (_) => setSheetState(() {}),
            ),

          const SheetLabel('Daily labour on this load?'),
          FieldRow(
            left: TextFieldRow(
              controller: labourers,
              label: 'Labourers',
              integer: true,
              placeholder: '0',
              onChanged: (_) => setSheetState(() {}),
            ),
            right: TextFieldRow(
              controller: hours,
              label: 'Hours worked',
              note: 'at ${rupees(rates.perHour)}/hr each',
              decimal: true,
              placeholder: '0',
              onChanged: (_) => setSheetState(() {}),
            ),
          ),

          Readout(label: 'Costed as', value: modeLabel[mode]!),
          if (contractCost > 0)
            Readout(
              label: 'Contract · $contractKg kg',
              value: rupees(contractCost),
            ),
          if (manhourCost > 0)
            Readout(
              label: 'Man-hours · $crew × $worked h',
              value: rupees(manhourCost),
            ),
          Readout(label: 'Loading cost', value: rupees(loadingCost)),

          const SheetLabel('Total'),
          Readout(label: 'Goods', value: rupees(goodsTotal)),
          if (transportProvided)
            Readout(label: 'Transport', value: rupees(transport)),
          Readout(
            label: 'Dispatch total',
            value: rupees(grandTotal),
            valueColour: T.elec,
          ),
          // Beside the total rather than inside it. Loading is what serving
          // this load costs us; it is not something the customer is charged.
          Readout(
            label: 'Cost to serve (loading)',
            value: rupees(loadingCost),
          ),

          TextFieldRow(
            controller: remarks,
            label: 'Remarks',
            note: 'opt.',
            maxLines: 2,
          ),

          // The 409 already sits on its own line; this is everything else.
          if (formError != null && rejected == null) FormWarning([formError!]),
        ],
      );
    },
    actions: (context, setSheetState) => [
      AppButton(
        label: 'Cancel',
        onPressed: posting ? null : () => Navigator.of(context).pop(false),
      ),
      AppButton(
        label: posting ? 'Posting…' : 'Post dispatch',
        variant: ButtonVariant.primary,
        loading: posting,
        onPressed: posting
            ? null
            : () async {
                num? asNum(String v) => num.tryParse(v.trim());

                // ---- validation, in the order the crew fills the form in ----
                String? validate() {
                  if (customerId == null || customerId!.isEmpty) {
                    return 'Pick the customer this is going to.';
                  }
                  if (date.isEmpty) return 'A dispatch date is needed.';
                  final filled = lines
                      .where((l) => l.stockGroupId.isNotEmpty)
                      .toList();
                  if (filled.isEmpty) return 'Add at least one line.';

                  for (final line in filled) {
                    final group = byId[line.stockGroupId];
                    final qty = asNum(line.qty);
                    if (group == null) {
                      return 'One of the lines points at stock that is no '
                          'longer listed.';
                    }
                    final noun =
                        unitNoun[group.unit] ?? unitNoun['sacks']!;
                    if (qty == null || qty <= 0) {
                      return '${group.label}: enter the ${noun.many} going '
                          'out.';
                    }
                    if (qty > group.availableQty) {
                      return '${group.label} has only '
                          '${counted(group.availableQty, group.unit)} left.';
                    }
                    // The lab's verdict, checked here as well as at the picker.
                    // The picker only offers passed stock, so this fires when
                    // the yard moved while the sheet was open. The server would
                    // refuse it anyway; saying so before the round trip is the
                    // difference between a corrected line and a rejected
                    // document.
                    if (group.qcStatus != 'pass') {
                      return '${group.label} has not passed QC — take it off '
                          'the document.';
                    }
                  }

                  // Two lines off one group would each be checked against the
                  // same figure and together take more than there is.
                  final ids = filled.map((l) => l.stockGroupId).toList();
                  if (ids.toSet().length != ids.length) {
                    return 'The same stock group is on two lines.';
                  }

                  // The rule the price block exists for: nothing goes out
                  // unpriced.
                  final qualityNames = <String>{};
                  for (final line in filled) {
                    final q = byId[line.stockGroupId]?.quality;
                    if (q != null) qualityNames.add(q);
                  }
                  final unpriced = qualityNames
                      .where(
                        (q) => !((asNum(prices[q]?.text ?? '') ?? 0) > 0),
                      )
                      .toList();
                  if (unpriced.isNotEmpty) {
                    return unpriced.length == 1
                        ? 'Enter the selling price for ${unpriced.first}.'
                        : 'Enter a selling price for each of: '
                              '${unpriced.join(', ')}.';
                  }

                  // Half a man-hour entry costs nothing and looks like it was
                  // filled in.
                  final crew = asNum(labourers.text) ?? 0;
                  final worked = asNum(hours.text) ?? 0;
                  if ((crew > 0) != (worked > 0)) {
                    return 'Daily labour needs both the number of labourers '
                        'and the hours worked.';
                  }
                  if (material == 'moulded' && !(crew > 0 && worked > 0)) {
                    return 'Moulded goods are costed by man-hours — enter the '
                        'labourers and hours.';
                  }
                  return null;
                }

                final problem = validate();
                setSheetState(() => formError = problem);
                if (problem != null) return;

                final filled = lines
                    .where((l) => l.stockGroupId.isNotEmpty)
                    .toList();
                num totalSacks = 0;
                for (final line in filled) {
                  if (byId[line.stockGroupId]?.unit == 'sacks') {
                    totalSacks += asNum(line.qty) ?? 0;
                  }
                }
                final contractKg = material == 'moulded'
                    ? 0
                    : (asNum(kgLoaded.text) ?? round2(totalSacks * sackKg));
                final crew = asNum(labourers.text) ?? 0;
                final worked = asNum(hours.text) ?? 0;
                final mode = material == 'moulded'
                    ? 'manhour'
                    : !(crew > 0 && worked > 0)
                    ? 'contract'
                    : contractKg > 0
                    ? 'mixed'
                    : 'manhour';

                final qualityNames = <String>{};
                for (final line in filled) {
                  final q = byId[line.stockGroupId]?.quality;
                  if (q != null) qualityNames.add(q);
                }

                setSheetState(() {
                  posting = true;
                  rejected = null;
                });

                try {
                  final doc = await dispatchService.create({
                    'customer_id': customerId,
                    'dispatch_date': date,
                    'transport_provided': transportProvided,
                    'transport_charge': transportProvided
                        ? (asNum(transportCharge.text) ?? 0)
                        : 0,
                    'remarks': remarks.text.trim().isEmpty
                        ? null
                        : remarks.text.trim(),
                    'lines': [
                      for (final line in filled)
                        {
                          'stock_group_id': line.stockGroupId,
                          'qty': asNum(line.qty),
                          // Advisory. The server writes the group's own unit
                          // onto the line and refuses a document that named a
                          // different one - which is what stops a stale form
                          // buying pieces at a sack price.
                          'unit': byId[line.stockGroupId]?.unit,
                        },
                    ],
                    'prices': {
                      for (final q in qualityNames)
                        q: asNum(prices[q]?.text ?? '') ?? 0,
                    },
                    // No entry at all when nothing was recorded - the
                    // customer's own crew loading their own vehicle is a real
                    // thing, and it is reported as a gap rather than invented
                    // as a zero.
                    'loading': (contractKg > 0 || crew > 0)
                        ? {
                            'loading_mode': mode,
                            'material_kind': material,
                            'kg_loaded': contractKg,
                            'manhour_labourers': crew,
                            'manhour_hours': worked,
                            'vehicle_no': vehicleNo.text.trim().isEmpty
                                ? null
                                : vehicleNo.text.trim(),
                          }
                        : null,
                  });

                  // Both counts where the document carried both. A load of
                  // forty sacks and four thousand loops has no single number,
                  // and reporting only the sacks would read as though the
                  // moulded half had not gone.
                  final went = [
                    if (doc.sacks > 0) counted(doc.sacks, 'sacks'),
                    if (doc.pieces > 0) counted(doc.pieces, 'pieces'),
                  ].join(' + ');
                  ui.notify(
                    'Dispatch posted · $went · ${rupees(doc.total)}',
                  );
                  if (context.mounted) Navigator.of(context).pop(true);
                } on ApiException catch (e) {
                  // A 409 is the yard having moved under the form - another
                  // vehicle took the sacks, or the group is on hold. Nothing
                  // was written, and the label the server named is what puts
                  // the message on the right line.
                  final label = e.errors.isNotEmpty
                      ? e.errors.first.label
                      : null;
                  setSheetState(() {
                    posting = false;
                    formError = e.message;
                    if (e.isConflict && label != null) {
                      rejected = (label: label, message: e.message);
                    }
                  });
                }
              },
      ),
    ],
  );

  transportCharge.dispose();
  remarks.dispose();
  kgLoaded.dispose();
  labourers.dispose();
  hours.dispose();
  vehicleNo.dispose();
  for (final c in prices.values) {
    c.dispose();
  }

  return posted;
}

/// The quantity on a line, labelled in the group's own unit. Its own widget so
/// the controller survives the sheet redrawing on every keystroke elsewhere.
class _QtyField extends StatefulWidget {
  const _QtyField({
    super.key,
    required this.line,
    required this.group,
    required this.onChanged,
  });

  final _Line line;
  final DispatchableStock? group;
  final ValueChanged<String> onChanged;

  @override
  State<_QtyField> createState() => _QtyFieldState();
}

class _QtyFieldState extends State<_QtyField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.line.qty,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    final noun = group == null
        ? null
        : (unitNoun[group.unit] ?? unitNoun['sacks']!);
    final packs = group?.packSize != null && group!.packSize! > 0
        ? round2((num.tryParse(_controller.text) ?? 0) / group.packSize!)
        : null;

    return TextFieldRow(
      controller: _controller,
      label: noun == null
          ? 'Quantity'
          : '${noun.many[0].toUpperCase()}${noun.many.substring(1)}',
      note: group == null
          ? null
          : [
              '${counted(group.availableQty, group.unit)} available',
              // A moulded order is placed in boxes, so the picker says how many
              // boxes the count on the line comes to.
              if (packs != null) '${group.packSize} to a pack · $packs packs',
            ].join(' · '),
      integer: true,
      placeholder: group != null ? numText(group.availableQty) : '0',
      onChanged: widget.onChanged,
    );
  }
}
