import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/constants.dart';
import '../../core/models/models.dart';
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
    final tick = context.watch<UiStore>().refreshTick;
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

    return RefreshIndicator(
      onRefresh: () async {
        await _load();
        await _loadDispatches();
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          ViewHead(
            title: 'History',
            meta: Text('${sorted.length} shown · tap a row to edit'),
          ),

          if (_dispatches.isNotEmpty) _RecentDispatches(rows: _dispatches),

          // The pickers. Every one narrows the list server-side.
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
            left: SelectFieldRow<String>(
              label: 'Batch',
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

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                'Couldn’t load history: $_error',
                style: const TextStyle(fontSize: 12, color: T.err),
              ),
            ),

          if (sorted.isEmpty && !_loading)
            const EmptyState(title: 'No runs match these filters.')
          else
            for (final run in sorted)
              _HistoryRow(run: run, onTap: () => _openRun(run)),
        ],
      ),
    );
  }
}

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
                      Text(
                        '${dayMonth(run.shiftDate)}'
                        '${run.shift.isNotEmpty ? ' · ${run.shift}' : ''}'
                        '${run.supervisor != null ? ' · ${run.supervisor}' : ''}',
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
                  if (run.firewoodKg != null)
                    Text('${run.firewoodKg} kg fw'),
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
          ],
        ),
      ),
    );
  }
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
                      style: const TextStyle(
                        fontSize: 11,
                        color: T.inkFaint,
                      ),
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
