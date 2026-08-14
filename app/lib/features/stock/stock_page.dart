import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/app_config.dart';
import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../services/services.dart';
import '../../state/auth_store.dart';
import '../../state/ui_store.dart';
import '../../widgets/ui.dart';
import 'new_dispatch_sheet.dart';

/// The Stock view - everything packed and standing in the plant, and what may
/// leave it.
///
/// This app reads `/stock/summary` and only that. It is not `/stock` with
/// fields hidden: it is a different response built by a different serializer on
/// the server, carrying the physical facts about the goods and none of the
/// commercial ones. The full packed-against-dispatched ledger is refused to a
/// supervisor at the route, so there is nothing here that depends on this
/// screen being careful.
///
/// Three kinds of stock, because there are three ways this plant makes
/// something it can sell:
///
///   reclaim  one card per batch and grade, with the lab's verdict on it.
///   coarse   not batch-identified - the line runs for a shift, not for a
///            batch - so it is pooled into ten-day thirds of the month.
///   moulded  what the presses made, one card per product and pack, counted in
///            pieces rather than sacks.
///
/// Nothing is hidden. A group the lab has not passed stays on the list with the
/// reason beside it and its Dispatch button disabled rather than absent - the
/// floor needs to know the stock exists and why it cannot go anywhere, and a
/// missing button is a question rather than an answer. A group that has gone
/// out entirely stays too, for the same reason.
///
/// The yard dispatches, and so does the back office - see [dispatchRoles]. The
/// vehicle is loaded here and the supervisor standing at it is the person who
/// knows what went on it, so the document is raised where the work happens.
///
/// The QC verdict is not settable from this screen at all. It is the lab's, and
/// it arrives here by polling and by the refresh signal when a run is unpacked.
///
/// A port of client/src/pages/user/StockPage.tsx.
class StockPage extends StatefulWidget {
  const StockPage({super.key});

  @override
  State<StockPage> createState() => _StockPageState();
}

const _qcOrder = <String>['pass', 'pending', 'fail'];

const _qcLabel = <String, String>{
  'pass': 'QC passed',
  'fail': 'QC failed',
  'pending': 'QC pending',
};

/// What each band means, under its heading, once per page rather than per card.
const _qcHint = <String, String>{
  'pass': 'released by the lab — this is what can go on a vehicle',
  'pending': 'packed and sent to the lab, no result yet',
  'fail': 'the lab said no — still here until it is reworked or written off',
};

const _qcTone = <String, PillTone>{
  'pass': PillTone.ok,
  'fail': PillTone.down,
  'pending': PillTone.paused,
};

const _kindNoun = <String, String>{
  'batch': 'batch',
  'pool': 'coarse pool',
  'product': 'moulded',
  // A sleeve or loop shift. Named "lot" rather than "moulded" beside a press's
  // groups, because the difference between the two is exactly what somebody
  // reading this line needs: one row is a shift the lab can answer on, the
  // other is every pack of a product pooled together.
  'lot': 'lot',
};

/// Why this account cannot press the button even when the stock is fine. Only
/// given once the stock itself has nothing wrong with it: telling somebody
/// standing in front of a failed pallet that they are the wrong account would
/// be true and useless.
const _notYours = 'Dispatches are raised by the yard or the back office';

/// One card, normalised off the summary row.
class _YardCard {
  const _YardCard({
    required this.id,
    required this.label,
    required this.ref,
    required this.grade,
    required this.kind,
    required this.unit,
    required this.available,
    required this.qc,
    this.packs,
    this.packSize,
    this.weightKg,
    this.packedFrom,
    this.packedTo,
    this.kindLine,
    this.samples,
  });

  final String id;

  /// The group's key - what a dispatch line names. Not what the card prints.
  final String label;

  /// What the card prints in its reference slot: the batch number where the
  /// goods carry one, and the label where they do not.
  ///
  /// A lot reads `03/Aug/26-day` with `Sleve` on the chip, and a batch group
  /// reads `B1041` with `Fine` on the chip - the number in the reference slot
  /// and what was made beside it, which is the shape every other reference in
  /// this app has. A coarse pool and a press's product group are not
  /// batch-identified and keep their label, `AUG-H1` and `LOOP-50`.
  final String ref;

  /// The grade on reclaim and coarse, the product on moulded goods. One field
  /// for both because the card is asking one question - what is this? - and the
  /// answer differs by kind rather than by there being two questions.
  final String? grade;
  final String kind;
  final String unit;
  final num available;
  final String qc;
  final num? packs;
  final int? packSize;
  final num? weightKg;
  final String? packedFrom;
  final String? packedTo;
  final String? kindLine;

  /// How far through its three samples a coarse pool is, and whether any of
  /// them came back a hold. Null on a batch or a moulded group, which are
  /// certified as a lot rather than sampled across a period.
  final ({int taken, int total, bool anyHold})? samples;
}

class _StockPageState extends State<StockPage> {
  int _seenTick = -1;
  bool _loading = true;
  List<StockSummaryRow> _rows = const [];
  Map<String, StockPool> _pools = const {};
  String _grade = '';
  String _qc = '';
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    // On a timer while somebody is looking at it.
    //
    // The lab and the yard are different accounts on different screens - a lab
    // account cannot open this app at all - so a verdict filed at the bench can
    // never reach this device through the app's own state. Polling is what
    // closes the gap. Thirty seconds is short enough that a released pool turns
    // up while the crew is still standing at it, and long enough that a tablet
    // propped open all shift is not a load.
    _poll = Timer.periodic(AppConfig.yardPoll, (_) {
      if (!mounted) return;
      // Not while the crew is on another tab. The shell keeps this page built
      // so returning to it is instant, but a yard re-read every thirty seconds
      // behind somebody's back is a request nobody asked for and a rebuild
      // landing on whatever they are actually using. Coming back to the tab
      // re-reads it - see didChangeDependencies.
      if (!TickerMode.valuesOf(context).enabled) return;
      _load();
    });
  }

  /// Whether this tab is the one being looked at, so the two halves of the
  /// web client's useRefreshOnFocus can both be kept: re-read on the way back
  /// in, and poll only while somebody is actually reading.
  bool _visible = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = TickerMode.valuesOf(context).enabled;
    // Coming back to the tab is the moment the numbers are about to be trusted,
    // and the moment a stale figure starts costing something - the lab may have
    // released a pallet or held one while the crew was on Packing.
    if (visible && !_visible) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
    _visible = visible;
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final stock = context.read<StockService>();
    final ui = context.read<UiStore>();
    if (mounted) setState(() => _loading = true);
    try {
      final rows = await stock.summary();
      // The pools come alongside the yard read so a coarse card can say how far
      // through its three samples the period is. A separate call because the
      // samples live with the lab's tests rather than on the stock row - and it
      // is allowed to fail on its own: the yard is worth showing without the
      // sampling progress on it.
      final pools = await stock.pools().catchError((_) => const <StockPool>[]);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _pools = {for (final p in pools) p.id: p};
      });
    } on ApiException catch (e) {
      ui.notify(e.message, ToastKind.err);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The second line of a card: what kind of stock it is, and the pack a
  /// moulded group is boxed in. A product with no pack size set reads "boxed
  /// loose", which is a real state rather than an error - the presses run
  /// whether or not the back office has filled the field in, and saying so on
  /// the card is what gets it filled in.
  String _kindLine(StockSummaryRow row) => [
    _kindNoun[row.kind] ?? row.kind,
    if (row.kind == 'product')
      row.packSize != null
          ? '${row.packSize} to a pack'
          : 'boxed loose — no pack size set',
    if (row.periodStart != null) '${row.periodStart} → ${row.periodEnd}',
  ].join(' · ');

  _YardCard _cardOf(StockSummaryRow row) {
    final pool = _pools[row.id];
    return _YardCard(
      id: row.id,
      label: row.label,
      // Already display form on this side - the server sends it through
      // displayLabel() - so the same two fields come off one.
      ref: (row.batchNo?.isNotEmpty ?? false) ? row.batchNo! : row.label,
      grade: row.quality,
      kind: row.kind,
      unit: row.unit,
      available: row.availableQty,
      qc: row.qcStatus,
      packs: row.availablePacks,
      packSize: row.packSize,
      weightKg: row.availableKg,
      packedFrom: row.firstPackedOn,
      packedTo: row.lastPackedOn,
      kindLine: _kindLine(row),
      samples: pool == null
          ? null
          : (
              taken: pool.samplesTaken,
              total: pool.samplesTotal,
              anyHold: pool.anyHold,
            ),
    );
  }

  /// Why this group cannot go on a vehicle, in the words to say it in. Short,
  /// because it goes on a disabled button's tooltip as well as under the badge.
  String? _blockedReason(_YardCard card) {
    if (card.qc == 'fail') return 'QC failed — cannot be dispatched';
    if (card.qc == 'pending') {
      return 'QC pending — the lab has not released it';
    }
    if (card.available <= 0) return 'Nothing left in this group';
    return null;
  }

  /// What a set of cards comes to: how many groups, how much of each unit, and
  /// what it weighs.
  ///
  /// Sacks and pieces are counted apart and never summed together. "412 held"
  /// reading as sacks when half of it is loops is worse than no total at all,
  /// and kg is the only figure that legitimately covers both - which is also
  /// what a lorry is loaded by.
  ({int groups, num sacks, num pieces, num kg}) _tally(List<_YardCard> cards) {
    var groups = 0;
    num sacks = 0;
    num pieces = 0;
    num kg = 0;
    for (final c in cards) {
      groups += 1;
      if (c.unit == 'sacks') sacks += c.available;
      if (c.unit == 'pieces') pieces += c.available;
      kg += c.weightKg ?? 0;
    }
    return (groups: groups, sacks: sacks, pieces: pieces, kg: kg);
  }

  String _tallyLine(({int groups, num sacks, num pieces, num kg}) t) => [
    '${t.groups} ${t.groups == 1 ? 'group' : 'groups'}',
    if (t.sacks > 0) counted(t.sacks, 'sacks'),
    if (t.pieces > 0) counted(t.pieces, 'pieces'),
    if (t.kg > 0) kgOf(t.kg),
  ].join(' · ');

  /// The same tally without the group count, for the page heading - which has
  /// just said how many groups there are. "nothing ready" rather than an empty
  /// string, because a heading that simply stops reads as a figure that failed
  /// to load, and "no stock has passed QC" is one of the more important things
  /// this page can be saying.
  String _readyLine(({int groups, num sacks, num pieces, num kg}) t) {
    final parts = [
      if (t.sacks > 0) counted(t.sacks, 'sacks'),
      if (t.pieces > 0) counted(t.pieces, 'pieces'),
    ];
    return parts.isEmpty ? 'nothing ready' : '${parts.join(' · ')} ready';
  }

  Future<void> _openDispatch(String? groupId, List<_YardCard> cards) async {
    // The buttons are disabled for an account that may not dispatch and the
    // sheet is not offered to one either, so this cannot normally be reached.
    // It is here because "the sheet only opens for a dispatcher" should be true
    // of the function that opens it, not only of the places that call it.
    if (!context.read<AuthStore>().mayDispatch) return;
    final posted = await showNewDispatchSheet(
      context: context,
      initialGroupId: groupId,
      // Handed every group rather than the passed ones, because the sheet is
      // what decides selectability and it says why about the rest.
      groups: [
        for (final c in cards)
          DispatchableStock(
            id: c.id,
            label: c.ref,
            quality: c.grade,
            unit: c.unit,
            availableQty: c.available,
            packSize: c.packSize,
            qcStatus: c.qc,
          ),
      ],
    );
    if (posted == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final mayDispatch = context.watch<AuthStore>().mayDispatch;
    final cards = _rows.map(_cardOf).toList();

    if (_loading && cards.isEmpty) {
      return const PageLoader(label: 'Loading stock');
    }

    if (cards.isEmpty) {
      return ListView(
        children: const [
          ViewHead(title: 'Stock'),
          EmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'Nothing packed and ready',
            hint:
                'Bag a weighed run or box a press run on the Packing tab and '
                'it is filed here as stock — coarse into its ten-day pool, '
                'moulded goods against their product and pack, everything else '
                'against its batch and grade.',
          ),
        ],
      );
    }

    // The grades and products actually in the yard, and how many groups of
    // each. A filter left on a value the yard no longer holds shows an empty
    // screen with no clue why, so it falls back to all.
    final gradeCounts = <String, int>{};
    for (final c in cards) {
      if (c.grade != null) {
        gradeCounts[c.grade!] = (gradeCounts[c.grade!] ?? 0) + 1;
      }
    }
    final grades = gradeCounts.keys.toList()..sort();
    final grade = grades.contains(_grade) ? _grade : '';

    final qcCounts = <String, int>{};
    for (final c in cards) {
      qcCounts[c.qc] = (qcCounts[c.qc] ?? 0) + 1;
    }
    final qc = qcCounts.containsKey(_qc) ? _qc : '';

    final visible =
        cards
            .where(
              (c) =>
                  (grade.isEmpty || c.grade == grade) &&
                  (qc.isEmpty || c.qc == qc),
            )
            .toList()
          // Spent groups last, live stock first. A group that has gone out
          // entirely is listed rather than hidden - a pallet somebody is
          // looking for and cannot find on the screen has not been told it is
          // empty, they have been told nothing. But it is finished business,
          // and a month of it above today's stock would bury the thing the crew
          // opened the tab for.
          ..sort(
            (a, b) => (b.available > 0 ? 1 : 0) - (a.available > 0 ? 1 : 0),
          );

    // The whole yard by verdict, whatever the filters are set to. Deliberately
    // built off every card rather than the visible ones: it is the state of the
    // plant, and a summary that moved when a filter was tapped would be a
    // second, quieter filter.
    final standing = {
      for (final status in _qcOrder)
        status: _tally(cards.where((c) => c.qc == status).toList()),
    };

    final bands = [
      for (final status in _qcOrder)
        (status: status, rows: visible.where((c) => c.qc == status).toList()),
    ].where((b) => b.rows.isNotEmpty).toList();

    final hasLoadable = cards.any((c) => c.available > 0 && c.qc == 'pass');
    final dispatchHint = !mayDispatch
        ? _notYours
        : hasLoadable
        ? null
        : 'Nothing has passed QC with stock left';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          // The count of groups on screen, then what is actually sellable. The
          // second is the answer to "can this order go out today"; the first is
          // only how much of the yard the filters are letting through.
          ViewHead(
            title: 'Stock',
            meta: Text(
              '${(grade.isNotEmpty || qc.isNotEmpty) ? '${visible.length} of ${cards.length}' : cards.length} '
              'groups · ${_readyLine(standing['pass']!)}',
            ),
          ),

          // What is standing in each verdict, before any of the cards. The
          // bands below answer "which batch"; this answers "how much is stuck",
          // which is the question a manager walks in with and which the card
          // list makes you add up by eye.
          TallyStrip(
            cells: [
              for (final status in _qcOrder)
                (
                  badge: StatePill(_qcLabel[status]!, tone: _qcTone[status]!),
                  line: _tallyLine(standing[status]!),
                  nil: standing[status]!.groups == 0,
                ),
            ],
          ),

          // One grade in the yard is not something to filter by.
          if (grades.length > 1)
            FilterChips(
              allCount: cards.length,
              selected: grade,
              onSelect: (v) => setState(() => _grade = v),
              options: [
                for (final g in grades)
                  (
                    value: g,
                    label: g,
                    count: gradeCounts[g] ?? 0,
                    colour: qualityColour[g],
                  ),
              ],
            ),

          // The verdict filter only earns its row once the yard holds more than
          // one verdict - otherwise every card is the same colour.
          if (qcCounts.length > 1)
            FilterChips(
              allCount: cards.length,
              selected: qc,
              onSelect: (v) => setState(() => _qc = v),
              options: [
                for (final status in _qcOrder)
                  if ((qcCounts[status] ?? 0) > 0)
                    (
                      value: status,
                      label: _qcLabel[status]!,
                      count: qcCounts[status]!,
                      colour: switch (status) {
                        'pass' => T.ok,
                        'fail' => T.err,
                        _ => T.warn,
                      },
                    ),
              ],
            ),

          // The cards each dispatch their own group; this is for a vehicle
          // loaded off several at once, which has no card to start from. The
          // reason is printed beside the button rather than left on its
          // tooltip: a disabled button is not focusable and a tablet has no
          // hover, so a tooltip alone is a control that is dead and mute on
          // exactly the devices this app is used on.
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (dispatchHint != null)
                  Expanded(
                    child: Text(
                      dispatchHint,
                      textAlign: TextAlign.right,
                      style: const TextStyle(fontSize: 11, color: T.inkFaint),
                    ),
                  ),
                const SizedBox(width: 10),
                AppButton(
                  label: 'Issue a dispatch ▸',
                  tooltip: dispatchHint,
                  onPressed: mayDispatch && hasLoadable
                      ? () => _openDispatch(null, cards)
                      : null,
                ),
              ],
            ),
          ),

          if (visible.isEmpty)
            const EmptyState(title: 'No stock matches those filters.')
          else
            for (final band in bands) ...[
              // The heading carries the quantities as well as the count of
              // groups: "3 groups" is not an answer to how much can go out, and
              // that is what somebody is standing here to ask.
              SectionHead(
                _qcLabel[band.status]!,
                count: _tallyLine(_tally(band.rows)),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _qcHint[band.status]!,
                  style: const TextStyle(fontSize: 11, color: T.inkFaint),
                ),
              ),
              CardGrid(
                children: [
                  for (final card in band.rows)
                    _StockCard(
                      card: card,
                      reason: _blockedReason(card),
                      mayDispatch: mayDispatch,
                      onDispatch: () => _openDispatch(card.id, cards),
                    ),
                ],
              ),
            ],
        ],
      ),
    );
  }
}

class _StockCard extends StatelessWidget {
  const _StockCard({
    required this.card,
    required this.reason,
    required this.mayDispatch,
    required this.onDispatch,
  });

  final _YardCard card;

  /// What is wrong with the *stock*. Printed on the card, because it is a fact
  /// about the goods and it differs card to card. Who may issue a dispatch does
  /// not - it is the same sentence on every card on that account - so that goes
  /// once beside the header button.
  final String? reason;
  final bool mayDispatch;
  final VoidCallback onDispatch;

  /// "packed 3 Aug", or the span where a group was filled over several days.
  String? _packedSpan() {
    final from = card.packedFrom;
    final to = card.packedTo;
    if (from == null && to == null) return null;
    if (from == null || to == null || from == to) {
      return 'packed ${dayMonth(from ?? to)}';
    }
    return 'packed ${dayMonth(from)} → ${dayMonth(to)}';
  }

  @override
  Widget build(BuildContext context) {
    final spent = card.available <= 0;
    final loadable = mayDispatch && card.qc == 'pass' && card.available > 0;
    final noun = unitNoun[card.unit] ?? unitNoun['sacks']!;

    return Opacity(
      opacity: spent ? 0.6 : 1,
      child: Panel(
        margin: const EdgeInsets.only(bottom: 8),
        accent: switch (card.qc) {
          'pass' => T.ok,
          'fail' => T.err,
          _ => T.warn,
        },
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
                      // The reference, then what it is. A lot reads
                      // `03/Aug/26-day` with `SLEVE` on the chip - the shift
                      // and the product side by side, because neither names the
                      // goods on its own.
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            card.ref,
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: T.ink,
                            ),
                          ),
                          if (card.grade != null) QualityChip(card.grade!),
                        ],
                      ),
                      const SizedBox(height: 4),
                      if (card.kindLine != null && card.kindLine!.isNotEmpty)
                        Text(
                          card.kindLine!,
                          style: const TextStyle(
                            fontSize: 11,
                            color: T.inkFaint,
                          ),
                        ),
                      // When it was packed and what it weighs - the two things
                      // asked at the gate that a count alone cannot answer.
                      Builder(
                        builder: (_) {
                          final line = [
                            _packedSpan(),
                            if (card.weightKg != null) kgOf(card.weightKg),
                          ].whereType<String>().join(' · ');
                          return Text(
                            line.isEmpty ? 'packing date not recorded' : line,
                            style: const TextStyle(
                              fontSize: 11,
                              color: T.inkFaint,
                            ),
                          );
                        },
                      ),
                      // Coarse is sampled across its period rather than
                      // certified as a lot, so the card says how far through
                      // those three samples the pool is.
                      if (card.samples != null)
                        Text(
                          '${card.samples!.taken} of ${card.samples!.total} '
                          'sampled'
                          '${card.samples!.anyHold ? ' · a hold on record' : ''}',
                          style: TextStyle(
                            fontSize: 11,
                            color: card.samples!.anyHold ? T.warn : T.inkFaint,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${card.available}',
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                        color: T.ink,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      // A pack count beside the pieces, because the floor moves
                      // boxes and the order was in boxes.
                      '${noun.many}'
                      '${card.packs != null ? ' · ${card.packs} packs' : ''}',
                      style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StatePill(
                        _qcLabel[card.qc] ?? card.qc,
                        tone: _qcTone[card.qc] ?? PillTone.neutral,
                      ),
                      if (reason != null) ...[
                        const SizedBox(height: 5),
                        Text(
                          reason!,
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: T.inkFaint,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                // Disabled rather than absent. The server refuses the dispatch
                // regardless, so this is about telling somebody why, not about
                // enforcement.
                AppButton(
                  dense: true,
                  label: 'Dispatch ▸',
                  variant: ButtonVariant.primary,
                  tooltip: reason ?? (mayDispatch ? null : _notYours),
                  onPressed: loadable ? onDispatch : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
