import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../state/auth_store.dart';
import '../../state/runs_store.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/sheet.dart';
import '../../widgets/ui.dart';

/// Packing - the door everything the plant makes comes into the yard by.
///
/// Two benches, listed together because they are one job on the floor: the
/// shift finishes, and what it made gets counted into stock. One run is one
/// card on either of them - nothing on this screen is added to anything else.
///
///   bagging  everything weighed goes out in 50 kg sacks, and the remainder
///            under one sack is not bagged - it is carried into the next batch
///            of the same grade. That carry is the whole reason this is its own
///            step rather than a number typed on the Weigh tab.
///   boxing   a press, a sleeve bench or a loop bench moulds finished goods and
///            counts them one at a time. There is nothing to weigh and nothing
///            to carry: the only question is how many of that run were boxed,
///            and the pack they go into is read off the product rather than
///            asked for, so nobody can file a hundred loose pieces as two packs
///            of fifty.
///
/// A port of client/src/pages/user/PackingPage.tsx.
class PackingPage extends StatefulWidget {
  const PackingPage({super.key});

  @override
  State<PackingPage> createState() => _PackingPageState();
}

/// One line of the packing list, and it is one run - every card on this screen,
/// bagged or boxed.
///
/// Nothing on this list is added to anything else. A bagged run could never be:
/// the sub-sack remainder is carried into the next batch of that grade, so two
/// runs cannot be totalled without deciding whose carry the answer belongs to.
/// Boxing has no such arithmetic - a piece is a piece - but a pooled count is a
/// figure nobody on the floor can check: the crew counts what came off a
/// machine, not what came off a product.
class _PackCard {
  const _PackCard({
    required this.key,
    required this.press,
    required this.label,
    required this.batch,
    required this.run,
  });

  final String key;
  final bool press;

  /// What the card is filed under: the product, or the grade.
  final String label;

  /// The lot number, where the run has one. Null on a press run, which moulds
  /// against a product and is never given one.
  final String? batch;
  final Run run;

  /// What names the card in the reference slot.
  ///
  /// The lot number where the run has one - a batch of reclaim, a sleeve lot, a
  /// loop lot. A press names its press and when it started instead: that is
  /// what tells two cards of the same product apart now that a shift's runs are
  /// listed rather than pooled.
  String get ref =>
      batch ??
      [
        run.machine ?? run.machineId,
        '${dayMonth(run.shiftDate)} ${clock24(run.startedAt)}',
      ].where((s) => s.isNotEmpty).join(' · ');
}

class _PackingPageState extends State<PackingPage> {
  int _seenTick = -1;
  String _grade = '';

  /// Which card is one tap from having its packing undone, and which is busy.
  String? _confirming;
  String? _undoing;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// On mount, and whenever anything asks for a refresh. The second half is
  /// what a delete needs: a run corrected out of existence in History would
  /// otherwise stay on the bagging bench until the app was restarted - a card
  /// the crew could still open and pack, filing sacks against a run that no
  /// longer exists.
  Future<void> _load() => context.read<RunsStore>().fetchPendingPack();

  /// Boxed by the piece rather than bagged by weight - a press, and the sleeve
  /// and loop benches. What it means is "counted, not weighed".
  static bool _isPress(Run run) => run.kind == 'press' || isMoulding(run.kind);

  /// Weighed kg plus whatever the previous batch of this grade left behind.
  static num _totalFor(Run run) => round2(run.weight + (run.leftoutIn ?? 0));

  static int _sacksNeeded(Run run) {
    final n = (_totalFor(run) / sackKg).floor();
    return n < 0 ? 0 : n;
  }

  /// What the run is filed under on this screen. A press, a sleeve bench and a
  /// loop bench have no grade - they moulded a product - so they are filed
  /// under the product. Everything else is its grade, and a run with none is
  /// coarse.
  static String _gradeOf(Run run) =>
      _isPress(run) ? (run.product ?? 'Moulded') : (run.quality ?? 'Coarse');

  /// The list itself: one card per run waiting, boxed ones first so the two
  /// benches do not interleave. Within each, the order the server sent them in.
  List<_PackCard> _cards(List<Run> pending) {
    final boxed = <_PackCard>[];
    final bagged = <_PackCard>[];
    for (final run in pending) {
      final press = _isPress(run);
      final card = _PackCard(
        key: run.id,
        press: press,
        label: _gradeOf(run),
        batch: run.batchNo,
        run: run,
      );
      (press ? boxed : bagged).add(card);
    }
    return [...boxed, ...bagged];
  }

  // ---- the pack / box sheet -------------------------------------------

  Future<void> _openSheet(_PackCard card) async {
    final ui = context.read<UiStore>();
    final runs = context.read<RunsStore>();
    final run = card.run;
    final boxing = card.press;

    final moulded = run.pieces ?? 0;
    final boxed = run.packedPieces ?? 0;
    final needed = _sacksNeeded(run);

    final count = TextEditingController(
      text: boxing
          ? numText(boxed != 0 ? boxed : (moulded != 0 ? moulded : null))
          : numText(run.packedSacks ?? needed),
    );

    await showAppSheet<void>(
      context: context,
      title: '${boxing ? 'Box' : 'Pack'} ${card.ref} · ${card.label}',
      subtitle: boxing
          ? '$moulded pieces moulded on this run. The pack is read off the '
                'product, so only the count is entered here.'
          : 'Weighed ${run.weight} kg'
                '${(run.leftoutIn ?? 0) > 0 ? ' + ${run.leftoutIn} kg carried = ${_totalFor(run)} kg' : ''}'
                ' · $sackKg kg per sack.',
      led: T.elec,
      body: (context, setSheetState) {
        final entered = num.tryParse(count.text.trim()) ?? 0;
        final leftOut = boxing ? 0 : round2(_totalFor(run) - entered * sackKg);
        final unboxed = boxing ? moulded - entered : 0;

        if (boxing) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Readout(label: 'Moulded on this run', value: '$moulded pieces'),
              // What is still on the bench. A press run stays on this list
              // until every piece is accounted for, so the figure that keeps it
              // here is the one shown.
              Readout(
                label: 'Not yet boxed',
                value: '$unboxed pieces',
                valueColour: unboxed < 0
                    ? T.err
                    : unboxed > 0
                    ? T.warn
                    : T.elec,
              ),
              TextFieldRow(
                controller: count,
                label: 'Pieces boxed',
                note: 'filed as stock, pending the lab',
                integer: true,
                placeholder: '$moulded',
                onChanged: (_) => setSheetState(() {}),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if ((run.leftoutIn ?? 0) > 0)
              Readout(
                label: 'Carried in from last batch',
                value: '+${run.leftoutIn} kg',
                valueColour: T.elec,
              ),
            Readout(
              label: 'Full sacks',
              value: '$needed sacks · ${needed * sackKg} kg',
            ),
            Readout(
              label: 'Left out → next ${card.label} batch',
              value: '$leftOut kg',
              valueColour: leftOut < 0 ? T.err : T.warn,
            ),
            TextFieldRow(
              controller: count,
              label: 'Sacks packed',
              integer: true,
              placeholder: '$needed',
              onChanged: (_) => setSheetState(() {}),
            ),
          ],
        );
      },
      actions: (context, setSheetState) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: boxing ? 'Box into stock' : 'Pack & carry forward',
          variant: ButtonVariant.primary,
          onPressed: () async {
            final text = count.text.trim();
            final entered = num.tryParse(text);
            if (text.isEmpty || entered == null || entered < 0) {
              ui.notify(
                boxing ? 'Enter the pieces boxed' : 'Enter the sacks packed',
                ToastKind.warn,
              );
              return;
            }
            if (boxing && entered > moulded) {
              ui.notify('This run moulded $moulded pieces', ToastKind.warn);
              return;
            }
            final leftOut = round2(_totalFor(run) - entered * sackKg);
            if (!boxing && leftOut < 0) {
              ui.notify(
                'That is more than the ${_totalFor(run)} kg available',
                ToastKind.warn,
              );
              return;
            }

            // `packed_pieces` and `packed_sacks` are absolute figures on the
            // run rather than deltas, so this is safe to re-enter: the same
            // count resolves to the same yard, and a correction from 800 to 870
            // moves seventy pieces rather than re-cutting anything.
            final result = await runs.pack(
              run.id,
              boxing
                  ? {'pieces': entered}
                  : {
                      'sacks': entered,
                      'leftoutIn': run.leftoutIn ?? 0,
                      'leftoutOut': leftOut,
                    },
            );
            if (result == null) return;

            // The boxing bench says whether the pieces reached the yard, and
            // that is not the same question as whether the call succeeded.
            // Filing the stock is not allowed to fail the request, so without
            // this the sheet would close on a job nobody did.
            final filed = result.stockFiled != false;
            if (!filed) {
              ui.notify(
                result.stockNote ??
                    'Recorded on the run, but it did not reach Stock',
                ToastKind.warn,
              );
              return;
            }
            ui.notify(
              boxing
                  ? '$entered pieces boxed → Stock · awaiting QC'
                  : '$entered sacks packed → Stock · $leftOut kg carried '
                        'forward',
            );
            if (context.mounted) Navigator.of(context).pop();
          },
        ),
      ],
    );

    count.dispose();
  }

  /// Take the packing off a run, and say what came back out of the yard.
  ///
  /// "Deleted" on its own would understate it by exactly the part somebody
  /// would want to check: what this moves is stock, and the group empties - and
  /// goes entirely when this run was the only thing in it. The server's
  /// refusals come straight through rather than being reworded here; both of
  /// them name the document or the tab the work is actually on.
  Future<void> _undo(_PackCard card) async {
    final ui = context.read<UiStore>();
    setState(() => _undoing = card.run.id);
    final done = await context.read<RunsStore>().unpack(card.run.id);
    if (!mounted) return;
    setState(() {
      _undoing = null;
      _confirming = null;
    });
    if (done == null) return;

    if (done.stockNote != null) {
      ui.notify(done.stockNote!, ToastKind.warn);
      return;
    }
    final cleared = done.stockCleared;
    ui.notify(
      cleared == null
          ? '${card.ref} unpacked'
          : '${card.ref} unpacked — '
                '${cleared.removed ? '${cleared.label} cleared from stock' : '${cleared.taken} off ${cleared.label}'}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final runs = context.watch<RunsStore>();
    // The crew cannot undo a packing and the control is not drawn for it -
    // DELETE /runs/:id/pack is adminOnly, so the button would be a tap that
    // comes back 403. Nothing is taken away by that: the packed figure is
    // absolute and re-entering it is a correction the bench still has.
    final mayUnpack = context.watch<AuthStore>().mayUnpack;

    if (runs.loading && runs.pendingPack.isEmpty) {
      return const PageLoader(label: 'Loading runs');
    }

    if (runs.pendingPack.isEmpty) {
      return ListView(
        children: const [
          ViewHead(title: 'Packing'),
          EmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'Nothing to pack',
            hint:
                'Weigh a quality on R4 or a coarse shift and it lands here to '
                'be bagged. A press run lands here to be boxed as soon as its '
                'pieces are counted.',
          ),
        ],
      );
    }

    final cards = _cards(runs.pendingPack);

    // The grades and products actually waiting, rather than everything the
    // plant makes: offering one with nothing under it is a dead option on a
    // tablet - it is picked once, shows an empty list, and is never trusted
    // again.
    final counts = <String, int>{};
    for (final card in cards) {
      counts[card.label] = (counts[card.label] ?? 0) + 1;
    }
    final grades = counts.keys.toList()..sort();

    // A grade that has just been bagged off the list stops being an option, and
    // leaving the picker on it would show an empty screen with no clue why.
    final grade = grades.contains(_grade) ? _grade : '';
    final visible = grade.isEmpty
        ? cards
        : cards.where((c) => c.label == grade).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          ViewHead(
            title: 'Packing',
            meta: Text(
              grade.isNotEmpty
                  ? '${visible.length} of ${runs.pendingPack.length} to pack'
                  : '${runs.pendingPack.length} to pack',
            ),
          ),

          // One thing waiting is not something to filter, so the row only
          // appears once there is a choice to make.
          if (grades.length > 1)
            FilterChips(
              allCount: runs.pendingPack.length,
              selected: grade,
              onSelect: (v) => setState(() => _grade = v),
              options: [
                for (final g in grades)
                  (
                    value: g,
                    label: g,
                    count: counts[g] ?? 0,
                    colour: qualityColour[g],
                  ),
              ],
            ),

          CardGrid(
            children: [
              for (final card in visible)
                _PackRow(
                  card: card,
                  armed: _confirming == card.key,
                  undoing: _undoing == card.run.id,
                  mayUnpack: mayUnpack,
                  onOpen: () => _openSheet(card),
                  onArm: () => setState(() => _confirming = card.key),
                  onDisarm: () => setState(() => _confirming = null),
                  onUndo: () => _undo(card),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PackRow extends StatelessWidget {
  const _PackRow({
    required this.card,
    required this.armed,
    required this.undoing,
    required this.mayUnpack,
    required this.onOpen,
    required this.onArm,
    required this.onDisarm,
    required this.onUndo,
  });

  final _PackCard card;
  final bool armed;
  final bool undoing;
  final bool mayUnpack;
  final VoidCallback onOpen;
  final VoidCallback onArm;
  final VoidCallback onDisarm;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    final run = card.run;
    final done = card.press ? (run.packedPieces ?? 0) : (run.packedSacks ?? 0);
    final total = _PackingPageState._totalFor(run);
    final moulded = run.pieces ?? 0;

    return Panel(
      margin: const EdgeInsets.only(bottom: 8),
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
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        BatchRef(card.ref),
                        QualityChip(card.label),
                        if (!card.press && run.formulation != null)
                          FormChip(run.formulation!),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      card.press
                          ? (done > 0
                                ? '$done of $moulded pieces boxed'
                                : 'moulded $moulded pieces')
                          : (done > 0
                                ? '$done sacks packed · '
                                      '${round2(total - done * sackKg)} kg left'
                                : 'weighed ${run.weight} kg'
                                      '${(run.leftoutIn ?? 0) > 0 ? ' + ${run.leftoutIn} carried = $total kg' : ''}'
                                      ' · ≈ ${_PackingPageState._sacksNeeded(run)} sacks'),
                      style: TextStyle(
                        fontSize: 11.5,
                        color: done > 0 ? T.elec : T.inkFaint,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  AppButton(
                    label: done > 0
                        ? 'Update ▸'
                        : card.press
                        ? 'Box ▸'
                        : 'Pack ▸',
                    variant: ButtonVariant.primary,
                    onPressed: onOpen,
                  ),
                  // Only once something has actually been packed. A run nobody
                  // has bagged yet has no packing to take off, and the server
                  // says so - offering the button anyway would be a tap whose
                  // only outcome is an error message.
                  if (mayUnpack && done > 0 && !armed) ...[
                    const SizedBox(height: 6),
                    AppButton(
                      dense: true,
                      label: 'Remove',
                      tooltip:
                          'Take this packing off and put the stock back '
                          'out of the yard',
                      onPressed: onArm,
                    ),
                  ],
                ],
              ),
            ],
          ),

          // The consequence spelled out beside the armed button rather than
          // left to the toast afterwards. What this moves is stock in the yard,
          // and the run staying put is the part worth saying - it is what makes
          // this different from the History tab's delete.
          if (armed) ...[
            const SizedBox(height: 10),
            Hint(
              'This takes $done ${card.press ? 'boxed pieces' : 'sacks'} back '
              'out of the yard and puts ${card.ref} back on the bench to be '
              '${card.press ? 'boxed' : 'packed'} again. The run itself stays '
              'on the record.',
            ),
            Row(
              children: [
                AppButton(
                  dense: true,
                  label: 'Yes, remove the packing',
                  variant: ButtonVariant.danger,
                  loading: undoing,
                  onPressed: onUndo,
                ),
                const SizedBox(width: 8),
                AppButton(dense: true, label: 'Cancel', onPressed: onDisarm),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
