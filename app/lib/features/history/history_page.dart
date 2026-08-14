import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/layout.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../services/services.dart';
import '../../state/auth_store.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/ui.dart';
import 'run_sheet.dart';

/// The whole run history, not just one shift.
///
/// Every row on record comes down - the plant has well over a thousand and the
/// crews scroll back through them - so the list is fetched with `all` rather
/// than a page at a time, and the day / shift / batch / machine pickers narrow
/// it server-side. Tapping a row opens that entry to correct or to delete.
///
/// A port of client/src/pages/user/HistoryPage.tsx.
class HistoryPage extends StatefulWidget {
  const HistoryPage({super.key});

  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
  int _seenTick = -1;

  String _date = '';
  String _shift = '';
  String _batch = '';
  String _machineId = '';

  List<Run> _rows = const [];
  bool _loading = true;
  String? _error;

  List<DispatchSummary> _dispatches = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ReportsStore>().fetchFilters();
      _load();
      _loadDispatches();
    });
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final res = await context.read<RunService>().list({
        'all': 1,
        'date': _date,
        'shift': _shift,
        'batch': _batch,
        'machineId': _machineId,
      });
      if (!mounted) return;
      setState(() => _rows = res.rows);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// What has left the yard lately.
  ///
  /// A dispatch is the last thing that happens to a batch and the one thing the
  /// crew who posted it could not otherwise see afterwards - the ledger is read
  /// per customer in the back office, which is a question the floor cannot ask.
  /// Without this, checking whether a document landed means posting it again.
  ///
  /// Read quietly: the run log underneath is the point of this tab, and a yard
  /// panel that could not load is not a reason to put an error over it. The
  /// route refuses anyone outside [dispatchRoles] anyway - this check is only so
  /// a worker's History tab does not fire a request every time it opens to be
  /// told 403.
  Future<void> _loadDispatches() async {
    if (!context.read<AuthStore>().mayDispatch) return;
    try {
      final rows = await context.read<DispatchService>().recent();
      if (mounted) setState(() => _dispatches = rows);
    } on ApiException {
      if (mounted) setState(() => _dispatches = const []);
    }
  }

  Future<void> _openRun(Run run) async {
    final result = await showRunSheet(context: context, run: run);
    if (result == null) return;
    setState(() {
      if (result.deletedId != null) {
        _rows = _rows.where((r) => r.id != result.deletedId).toList();
      }
      if (result.saved != null) {
        // The table follows the correction straight away rather than waiting
        // for the next fetch.
        _rows = _rows
            .map((r) => r.id == result.saved!.id ? result.saved! : r)
            .toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ui = context.watch<UiStore>();
    final signedInAs = ui.accountName;
    final signingAs = ui.supervisorName;

    final tick = ui.refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        context.read<ReportsStore>().fetchFilters();
        _load();
        _loadDispatches();
      });
    }

    final filters = context.watch<ReportsStore>().filters;

    // Newest first, on the same clock the shop floor reads: the shift the run
    // belongs to, then when it actually ended.
    final sorted = [..._rows]
      ..sort((a, b) {
        if (a.shiftDate != b.shiftDate) {
          return a.shiftDate.compareTo(b.shiftDate) * -1;
        }
        final ea = a.endedAt ?? a.startedAt;
        final eb = b.endedAt ?? b.startedAt;
        return eb.compareTo(ea);
      });

    if (_loading && _rows.isEmpty) {
      return const PageLoader(label: 'Loading history');
    }

    // Everything above the log, built as one item so the list below it can be
    // lazy.
    final head = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ViewHead(
          title: 'History',
          meta: Column(
            // Right-aligned and only as tall as its lines: the head lays this
            // out beside the title in a row, which gives it no height to fill.
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${sorted.length} shown · tap a row to edit'),
              // Who anything logged from this tablet right now would be signed
              // by, said over the log rather than left to be discovered in it.
              // The two names are the same on an ordinary shift and part when
              // the sheet's pick has been switched - which is exactly when the
              // crew reading History needs to be told.
              if (signedInAs.isNotEmpty)
                Text(
                  signingAs.isNotEmpty && signingAs != signedInAs
                      ? 'Signed in as $signedInAs · signing records as $signingAs'
                      : 'Signed in as $signedInAs · records are signed with this name',
                ),
            ],
          ),
        ),

        if (_dispatches.isNotEmpty) _RecentDispatches(rows: _dispatches),

        // The pickers. Every one narrows the list server-side.
        //
        // Two pairs, stacked on a phone and side by side once the screen can
        // hold four across - which puts every filter on one line on a tablet,
        // where before they were two lines with a tablet's worth of nothing
        // to the right of them.
        FieldColumns(
          minFieldWidth: 340,
          children: [
            FieldRow(
              left: SelectFieldRow<String>(
                label: 'Day',
                value: _date.isEmpty ? '' : _date,
                items: [
                  (value: '', label: 'All days'),
                  for (final d in filters.days) (value: d, label: dayMonth(d)),
                ],
                onChanged: (v) {
                  setState(() => _date = v ?? '');
                  _load();
                },
              ),
              right: SelectFieldRow<String>(
                label: 'Shift',
                value: _shift,
                items: [
                  (value: '', label: 'Both shifts'),
                  for (final s in shifts) (value: s, label: s),
                ],
                onChanged: (v) {
                  setState(() => _shift = v ?? '');
                  _load();
                },
              ),
            ),
            FieldRow(
              // Searched rather than scrolled, and the only picker on this row
              // that is: the other three are a screenful each, while the batch
              // list is every number the plant has ever run. See
              // SearchSelectRow.
              left: SearchSelectRow<String>(
                label: 'Batch',
                sheetTitle: 'Find a batch',
                searchLabel: 'Batch number',
                searchPlaceholder: 'e.g. 3079',
                value: _batch,
                items: [
                  (value: '', label: 'All batches'),
                  for (final b in filters.batches) (value: b, label: '#$b'),
                ],
                onChanged: (v) {
                  setState(() => _batch = v ?? '');
                  _load();
                },
              ),
              right: SelectFieldRow<String>(
                label: 'Machine',
                value: _machineId,
                items: [
                  (value: '', label: 'All machines'),
                  for (final m in filters.machines)
                    (value: m.id, label: m.name),
                ],
                onChanged: (v) {
                  setState(() => _machineId = v ?? '');
                  _load();
                },
              ),
            ),
          ],
        ),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              'Couldn’t load history: $_error',
              style: const TextStyle(fontSize: 12, color: T.err),
            ),
          ),

        if (sorted.isEmpty && !_loading)
          const EmptyState(title: 'No runs match these filters.'),
      ],
    );

    // The log itself, built a screenful at a time.
    //
    // This list is the plant's whole record - `all`, well over a thousand rows
    // - and it used to be a [CardGrid], which is a Wrap and therefore lays out
    // every child whether or not it is on screen. It survived that while a row
    // was five figures. It did not survive a row carrying the whole record: a
    // phone froze for five seconds on the tab and Android killed it for not
    // answering a touch.
    //
    // So the columns are done by hand here rather than by CardGrid: one list
    // item is one row of cards, and a builder only asks for the items the
    // viewport wants. A thousand rows now cost what a screenful costs.
    return LayoutBuilder(
      builder: (context, box) {
        final columns = columnsFor(
          box.maxWidth - 28,
          minTile: 380,
          gap: _cardGap,
          limit: 2,
        );
        final bands = (sorted.length / columns).ceil();

        return RefreshIndicator(
          onRefresh: () async {
            await _load();
            await _loadDispatches();
          },
          child: ListView.builder(
            padding: const EdgeInsets.only(bottom: 90),
            // The head is item zero, so it scrolls with the log rather than
            // sitting above it.
            itemCount: bands + 1,
            itemBuilder: (context, index) {
              if (index == 0) return head;
              final start = (index - 1) * columns;
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var column = 0; column < columns; column++)
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: column < columns - 1 ? _cardGap : 0,
                        ),
                        // The last band is short unless the count divides. An
                        // empty box keeps the card beside it a column wide
                        // rather than letting it stretch across.
                        child: start + column < sorted.length
                            ? _HistoryRow(
                                run: sorted[start + column],
                                onTap: () => _openRun(sorted[start + column]),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

/// The gap between two cards standing side by side, matching [CardGrid]'s.
const _cardGap = 10.0;

/// One logged run, as the table row reads it.
class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.run, required this.onTap});
  final Run run;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final k = kwhOf(run);
    final w = run.weightKg ?? run.outWeight;
    final h = runHoursOf(run);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(T.radius),
      child: Panel(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        run.machine ?? run.machineId,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: T.ink,
                        ),
                      ),
                      // The day, the shift, the name it is signed with - and
                      // the account that keyed it, on the one occasion that is
                      // news: when the sheet's pick was somebody else's name.
                      Text(
                        '${dayMonth(run.shiftDate)}'
                        '${run.shift.isNotEmpty ? ' · ${run.shift}' : ''}'
                        '${run.supervisor != null ? ' · ${run.supervisor}' : ''}'
                        '${run.enteredBy != null && run.enteredBy != run.supervisor ? ' · entered by ${run.enteredBy}' : ''}',
                        style: const TextStyle(
                          fontSize: 10.5,
                          color: T.inkFaint,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 18, color: T.inkFaint),
              ],
            ),
            const SizedBox(height: 7),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatePill(run.shift, tone: PillTone.shift),
                if (run.batchNo != null) BatchRef(run.batchNo!, size: 11.5),
                if (run.quality != null) QualityChip(run.quality!),
                if (run.formulation != null) FormChip(run.formulation!),
                // A press names its product, and what its pieces cost.
                if (run.product != null)
                  FormChip(
                    '${run.product}'
                    '${run.pieces != null ? ' · ${run.pieces} pcs' : ''}'
                    '${run.costPerPiece != null ? ' · ₹${run.costPerPiece}/pc' : ''}',
                  ),
              ],
            ),
            const SizedBox(height: 8),
            DefaultTextStyle(
              style: const TextStyle(fontSize: 11, color: T.inkDim),
              child: Wrap(
                spacing: 14,
                runSpacing: 4,
                children: [
                  Text(
                    run.isRunning
                        ? 'live'
                        : h == null
                        ? '— h'
                        : '${num1(h)} h',
                  ),
                  Text(k != null ? '${num1(k, 0)} kWh' : '— kWh'),
                  if (run.firewoodKg != null) Text('${run.firewoodKg} kg fw'),
                  Text('crew ${run.workers ?? '—'}'),
                  Text(
                    w != null
                        ? '$w kg'
                        : ((run.needsWeigh ?? false) ||
                              (run.needsWeight ?? false))
                        ? 'weight pending'
                        : '— kg',
                  ),
                  // A shiftwise machine keeps one record per shift, so these
                  // hours are every start of it added together.
                  if ((run.passes ?? 1) > 1)
                    Text('${run.passes} start/stops combined'),
                ],
              ),
            ),
            _Rest(run),
          ],
        ),
      ),
    );
  }
}

/// The rest of the record, under the figures.
///
/// The card above is the summary: the machine, the grade and the five numbers a
/// crew scrolls looking for. Everything else the row holds - the meter readings
/// either side of it, the individual weighings, what the press moulded at, the
/// picking gang, the remarks - was only reachable by opening the entry, one at a
/// time. It is on the card now, so a shift reads as a shift.
///
/// Only what was actually recorded is drawn, so a grinding run stays four lines
/// and a press run is the one that gets long. It is one [Text.rich] rather than
/// a widget per figure: History fetches the whole log with `all`, and thirty
/// more widgets on each of a thousand rows is what makes a list stutter.
class _Rest extends StatelessWidget {
  const _Rest(this.run);
  final Run run;

  @override
  Widget build(BuildContext context) {
    final facts = _factsOf(run);
    if (facts.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 7),
      child: Text.rich(
        TextSpan(
          children: [
            for (var i = 0; i < facts.length; i++) ...[
              TextSpan(
                text: '${facts[i].$1} ',
                style: const TextStyle(color: T.inkFaint),
              ),
              TextSpan(
                text: facts[i].$2,
                style: const TextStyle(color: T.inkDim),
              ),
              if (i < facts.length - 1)
                const TextSpan(
                  text: '  ·  ',
                  style: TextStyle(color: T.rule),
                ),
            ],
          ],
        ),
        style: const TextStyle(fontSize: 10.5, height: 1.6),
      ),
    );
  }
}

/// Everything on the record that the card above does not already say, in the
/// order the shift happened: what was set up, what the meters read, what came
/// off it, what it cost, and then whatever the crew wrote at the end.
///
/// A blank is not a fact. Anything the run has no value for is left out rather
/// than drawn as a dash, because a dash for each of thirty fields is thirty
/// lines of nothing on a row that recorded four things.
List<(String, String)> _factsOf(Run run) {
  final out = <(String, String)>[];

  void add(String label, Object? value) {
    if (value == null) return;
    final text = value.toString().trim();
    if (text.isEmpty) return;
    out.add((label, text));
  }

  // Set up.
  add('line', run.line);
  add('capacity', run.capacity != null ? '${run.capacity} kg' : null);
  final tyre = run.tyreType != null ? tyres[run.tyreType] : null;
  add(
    'tyre',
    tyre != null ? '${tyre.label} ${run.mesh ?? tyre.mesh}' : run.mesh,
  );
  add('mix', run.sources.isNotEmpty ? run.sources.join(' + ') : null);

  // The clock. Both stamps are written when the tablet syncs, so they say when
  // the entry landed rather than how long the machine ran - the hours on the
  // card above are the run time, and these two are not it.
  add(
    'logged',
    '${clock24(run.startedAt)} → '
        '${run.endedAt != null ? clock24(run.endedAt) : 'running'}',
  );
  if (run.paused) add('paused', 'yes');
  if (run.paired) add('paired', 'yes');
  add('merged from', run.mergedFrom);

  // The meters, as they were read rather than as the difference between them.
  if (run.hourStart != null || run.hourEnd != null) {
    add('hour meter', '${num1(run.hourStart)} → ${num1(run.hourEnd)}');
  }
  if (run.elecStart != null || run.elecEnd != null) {
    add('elec meter', '${num1(run.elecStart)} → ${num1(run.elecEnd)}');
  }

  // What came off it.
  if (run.weighEntries.isNotEmpty) {
    add('weighings', run.weighEntries.map(numText).join(' + '));
  }
  add('packed', run.packedSacks != null ? counted(run.packedSacks!) : null);
  add(
    'dispatched',
    run.dispatchedSacks != null ? counted(run.dispatchedSacks!) : null,
  );
  if (run.availSacks != null || run.availKg != null) {
    add(
      'in yard',
      [
        if (run.availSacks != null) counted(run.availSacks!),
        if (run.availKg != null) '${num1(run.availKg)} kg',
      ].join(' · '),
    );
  }
  if (run.leftoutIn != null || run.leftoutOut != null) {
    add('carried', '${run.leftoutIn ?? 0} → ${run.leftoutOut ?? 0} kg');
  }

  // A press: what it was moulded at, and what the mould cost.
  if (run.cureTempC != null || run.cyclicMin != null || run.cavities != null) {
    add(
      'moulded at',
      [
        if (run.cureTempC != null) '${run.cureTempC}°C',
        if (run.cyclicMin != null) '${run.cyclicMin} min',
        if (run.cavities != null) '${run.cavities} cavities',
      ].join(' · '),
    );
  }
  add('flash', run.flashKg != null ? '${run.flashKg} kg' : null);
  add('boxed', run.packedPieces != null ? '${run.packedPieces} pcs' : null);
  if (run.piecesExpected != null) {
    add(
      'expected',
      '${run.piecesExpected} pcs'
          '${run.piecesVariancePct != null ? ' · ${num1(run.piecesVariancePct)}% out' : ''}'
          '${run.piecesFlagged ? ' · flagged' : ''}',
    );
  }
  add('rate', run.compoundRate != null ? '₹${run.compoundRate}/kg' : null);
  add('material', run.materialCost != null ? '₹${run.materialCost}' : null);

  // The picking gang on a cracker shift - both halves or neither.
  if (run.pickingLabourHours != null) {
    add(
      'picking',
      '${run.pickingLabourers} × ${run.pickingHours} h = '
          '${num1(run.pickingLabourHours)} labourer-hours',
    );
  }

  // What is still owed on it, and what would not go in. `stockFiled` is only
  // false when the pack route answered that nothing reached the yard, which is
  // the one state a crew has to be told about rather than left to find.
  if (run.stockFiled == false) add('stock', 'not filed');
  add('stock note', run.stockNote);
  if (run.needsPack ?? false) add('packing', 'pending');
  if (run.nonProduction) add('non-production', 'yes');
  add('remarks', run.remarks);

  return out;
}

/// What has gone out lately, above the run log. Newest first and short: this is
/// "did that go through", not the sales record.
class _RecentDispatches extends StatelessWidget {
  const _RecentDispatches({required this.rows});
  final List<DispatchSummary> rows;

  @override
  Widget build(BuildContext context) => Panel(
    margin: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SheetLabel('Recently dispatched'),
        for (final d in rows)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: T.rule)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        d.customer ?? '—',
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: T.ink,
                        ),
                      ),
                    ),
                    Text(
                      d.dispatchDate != null ? dayMonth(d.dispatchDate) : '—',
                      style: const TextStyle(fontSize: 11, color: T.inkFaint),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      rupees(d.total),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: T.ink,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                // What actually left, by grade. A load is one row and usually
                // more than one product, so a sack count on its own says how
                // much went without saying what.
                if (d.sacksByQuality.isNotEmpty)
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      for (final entry in d.sacksByQuality.entries) ...[
                        QualityChip(entry.key),
                        Text(
                          '×${entry.value}',
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: T.inkFaint,
                          ),
                        ),
                      ],
                    ],
                  ),
                const SizedBox(height: 4),
                Text(
                  [
                    // Sacks and pieces counted apart - a document can carry
                    // both, and adding them would be arithmetic on two
                    // different quantities.
                    if (d.sacks > 0) counted(d.sacks, 'sacks'),
                    if (d.pieces > 0) counted(d.pieces, 'pieces'),
                    if (d.lines > 1) '${d.lines} stock groups',
                  ].join(' · '),
                  style: const TextStyle(fontSize: 11, color: T.inkFaint),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}
