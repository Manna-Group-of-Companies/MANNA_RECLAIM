import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/sheet.dart';
import '../../widgets/ui.dart';

/// The batch list: every open autoclave charge, and where each grade taken off
/// it has got to.
///
/// Nothing on this screen is computed from runs here - the API works the grid,
/// the state chip and the orphan flag out from the runs logged against the
/// batch number and sends them down with the batch. The card's job is to show
/// that and to offer the three decisions the floor actually makes: which grades
/// the charge will yield, when it can be closed, and whether a batch with
/// nothing against it should be deleted.
///
/// A port of client/src/pages/user/BatchesPage.tsx.
class BatchesPage extends StatefulWidget {
  const BatchesPage({super.key});

  @override
  State<BatchesPage> createState() => _BatchesPageState();
}

class _BatchesPageState extends State<BatchesPage> {
  int _seenTick = -1;

  /// What the three stage columns are, said when one is tapped.
  ///
  /// They look like the tick beside them and they are not: R3/R1, R4 and
  /// Weighed are worked out by the API from the runs logged against the batch
  /// number, so there is nothing here to press. Tapping one used to do
  /// literally nothing - no ripple, no message - which on a touch screen reads
  /// as a control that is broken or slow rather than one that was never a
  /// control. This is the same rule the rest of the app follows: say why,
  /// rather than leave somebody tapping.
  void _explainStage(Batch batch, BatchGrade row, String column) {
    final quality = row.quality;
    final done = switch (column) {
      'R3/R1' => row.refined,
      'R4' => row.finished,
      _ => row.weighed,
    };
    final how = switch (column) {
      'R3/R1' =>
        'lights once a refining run on R3 - or R1 standing in for it - is '
            'logged against this batch for $quality',
      'R4' =>
        'lights once a finishing run on R4 is logged against this batch for '
            '$quality',
      _ =>
        'lights once a weight is recorded against $quality on this batch — '
            'weigh it on the Weigh tab',
    };
    context.read<UiStore>().notify(
      done
          ? '$column · $quality is done on batch ${batch.ref}. It $how — it is '
                'not ticked here.'
          : '$column $how. It is not ticked here.',
      ToastKind.warn,
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() => context.read<BatchesStore>().fetchOpen();

  /// Why a grade cannot be un-ticked. A grade a refiner has already run is a
  /// statement about work that happened, so the card says where to correct it
  /// rather than letting the tick contradict the runs.
  String? _lockedReason(BatchGrade row) =>
      row.marked && (row.refined || row.finished || row.weighed)
      ? '${row.quality} has already been run off this batch — correct those '
            'runs in History to unmark it'
      : null;

  /// The same question for a batch that is only on screen because somebody
  /// asked to see every number. A closed batch is filed, and the server refuses
  /// every one of these edits - so the card shows the record and offers none of
  /// them, rather than drawing a control that answers back with a refusal.
  String? _lockedOnClosed(Batch batch, BatchGrade row) => batch.status == 'closed'
      ? 'Batch ${batch.ref} is closed. The back office can reopen it.'
      : _lockedReason(row);

  Future<void> _toggle(Batch batch, BatchGrade row) async {
    final ui = context.read<UiStore>();
    final locked = _lockedReason(row);
    if (locked != null) {
      ui.notify(locked, ToastKind.warn);
      return;
    }
    if (!batch.autoclaveDone) {
      ui.notify(
        'Batch ${batch.ref} is still in the autoclave — unload it first',
        ToastKind.warn,
      );
      return;
    }
    // Not gated on the write finishing.
    //
    // It used to be: the box was disabled until the answer came back, so a
    // crew that ticked a grade and immediately wanted it off again tapped a
    // dead box for as long as the round trip took - and this endpoint is not
    // quick, because the server re-reads the batch and its runs, writes, and
    // re-derives the whole grid. The tick moved instantly and the *second* tap
    // did nothing, which is the lag that was left.
    //
    // Safe to let it through because the write is absolute rather than a
    // toggle - `setQuality(id, grade, marked)` states which way the grade goes,
    // so two taps in flight are two statements of intent and the last one to
    // land is the one that stands. A toggle would have to be serialised.
    final error = await context.read<BatchesStore>().setQuality(
      batch.id,
      row.quality,
      !row.marked,
    );
    if (error != null) ui.notify(error, ToastKind.err);
  }

  Future<void> _close(Batch batch) async {
    final ui = context.read<UiStore>();
    final store = context.read<BatchesStore>();
    final go = await confirmSheet(
      context: context,
      title: 'Close batch ${batch.ref}?',
      subtitle:
          'It drops off this tab and stops taking new runs, and stays on the '
          'dispatch and history record. The back office can reopen it.',
      body:
          '${batch.formulation ?? 'No formulation recorded'} · '
          '${batch.capacity ?? '--'} kg charge · '
          '${batch.packedSacks ?? 0} sacks packed ($sackKg kg each).',
      keepLabel: 'Keep open',
      goLabel: 'Close batch',
    );
    if (!go) return;
    // The server owns the rule, so its count of what is outstanding is what the
    // crew is shown rather than a guess made here.
    final error = await store.close(batch.id);
    ui.notify(
      error ?? 'Batch ${batch.ref} closed',
      error == null ? ToastKind.ok : ToastKind.err,
    );
  }

  Future<void> _delete(Batch batch) async {
    final ui = context.read<UiStore>();
    final store = context.read<BatchesStore>();
    final go = await confirmSheet(
      context: context,
      title: 'Delete batch ${batch.ref}?',
      subtitle:
          'Only an orphaned batch can be deleted. Its quality tests go with '
          'it, and this cannot be undone.',
      body:
          '${batch.machineId.isEmpty ? 'No autoclave' : batch.machineId} · '
          '${batch.formulation ?? 'no formulation'} · opened '
          '${dayMonth(batch.openedAt)}. No run has ever been logged against '
          'this number.',
      keepLabel: 'Keep it',
    );
    if (!go) return;
    final (gone, error) = await store.remove(batch.id);
    if (error != null) {
      ui.notify(error, ToastKind.err);
      return;
    }
    final tests = gone?.qualityTests ?? 0;
    ui.notify(
      'Batch ${batch.ref} deleted'
      '${tests > 0 ? ' · $tests quality test(s) removed' : ''}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final store = context.watch<BatchesStore>();

    if (store.loading && store.items.isEmpty) {
      return const PageLoader(label: 'Loading batches');
    }

    final shown = store.visible;
    final closedCount = store.archive
        .where((b) => b.status == 'closed')
        .length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          ViewHead(
            title: 'Batches',
            meta: Text(
              store.scope == 'open'
                  ? '${store.items.length} active'
                  : '${shown.length} batch${shown.length == 1 ? '' : 'es'}',
            ),
          ),
          /*
           * Open is where this tab starts and what the floor works from. The
           * other two are for looking a number up - "was 3077 ever run", "what
           * did that one yield" - which is a question the crew was previously
           * told to take to the back office, because a batch left this list the
           * moment it closed.
           *
           * The counts on All and Closed read 0 until the tap that loads them,
           * which is why the chip that is loading says so underneath rather
           * than leaving an empty grid to be read as an empty plant.
           */
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: FilterChips(
              allLabel: 'All',
              allCount: store.archive.length,
              selected: store.scope,
              onSelect: (value) => unawaited(store.setScope(value)),
              options: [
                (
                  value: 'open',
                  label: 'Open',
                  count: store.items.length,
                  colour: null,
                ),
                (
                  value: 'closed',
                  label: 'Closed',
                  count: closedCount,
                  colour: T.steel,
                ),
              ],
            ),
          ),

          /*
           * Why Open and Closed do not add up to All, said once where it is
           * being read rather than left as an arithmetic error the reader has
           * to talk themselves out of. The Open chip is this tab's own list -
           * open special charges - while All is every number on record, coarse
           * and DRC charges included. Those are counted by their runs and never
           * worked in grades, so they have never belonged on the working list.
           */
          if (store.scope != 'open' && store.archive.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 4, right: 4, bottom: 10),
              child: Text(
                'Every batch number on record. Open counts the ${store.items.length} '
                'special charges this tab works from; the rest are coarse and DRC '
                'loads, which are counted by their runs rather than in grades.',
                style: const TextStyle(fontSize: 12, color: T.inkFaint),
              ),
            ),

          if (store.archiveLoading && shown.isEmpty)
            const PageLoader(label: 'Loading every batch')
          else if (store.archiveError != null && shown.isEmpty)
            EmptyState(
              icon: Icons.cloud_off_rounded,
              title: 'Could not load the batch list',
              hint: store.archiveError!,
            )
          else if (shown.isEmpty)
            EmptyState(
              icon: Icons.layers_rounded,
              title: store.scope == 'open'
                  ? 'No active batches'
                  : 'No batches on record',
              hint: store.scope == 'open'
                  ? 'Charge an autoclave with a special formulation on the '
                        'Machines tab to start one — coarse and DRC loads are '
                        'counted by their runs instead. Closed batches are on '
                        'the All and Closed chips above.'
                  : 'Nothing has been charged yet.',
            )
          else
            // Wider than the other cards before it will split: a batch card
            // carries the grade × stage grid, which is four columns of its own
            // and turns to mush in a narrow tile.
            CardGrid(
              minTileWidth: 420,
              maxColumns: 2,
              children: [
                for (final batch in shown)
                  _BatchCard(
                    batch: batch,
                    held: store.held.contains(batch.ref),
                    lockedReason: (row) => _lockedOnClosed(batch, row),
                    onToggle: _toggle,
                    onStageTap: _explainStage,
                    onClose: () => _close(batch),
                    onDelete: () => _delete(batch),
                    onDetails: () => _openDetail(batch),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _openDetail(Batch batch) async {
    final store = context.read<BatchesStore>();
    unawaited(store.openDetail(batch.id));
    await showAppSheet<void>(
      context: context,
      title: 'Batch ${batch.ref}',
      subtitle: [
        batch.machineId,
        batch.formulation,
        batch.stateLabel,
      ].where((s) => s != null && s.isNotEmpty).join(' · '),
      led: T.brand,
      body: (context, _) => Consumer<BatchesStore>(
        builder: (context, s, __) {
          final detail = s.detail;
          if (detail == null) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          return _BatchDetailBody(detail: detail);
        },
      ),
      actions: (context, _) => [
        AppButton(label: 'Close', onPressed: () => Navigator.of(context).pop()),
      ],
    );
    store.clearDetail();
  }
}

void unawaited(Future<void> future) {
  future.ignore();
}

/// Which way the state chip is tinted: cooking, waiting on a tick, or done.
Color _chipTone(Batch batch) {
  final marked = batch.markedCount ?? 0;
  if (marked > 0 && (batch.weighedCount ?? 0) == marked) return T.ok;
  if (batch.autoclaveDone && marked == 0) return T.warn;
  return T.ember;
}

class _BatchCard extends StatelessWidget {
  const _BatchCard({
    required this.batch,
    required this.held,
    required this.lockedReason,
    required this.onToggle,
    required this.onStageTap,
    required this.onClose,
    required this.onDelete,
    required this.onDetails,
  });

  final Batch batch;

  /// The lab has this batch on hold. A read of the quality record - the yard
  /// and the floor both need to see a verdict they cannot write.
  final bool held;
  final String? Function(BatchGrade) lockedReason;
  final Future<void> Function(Batch, BatchGrade) onToggle;

  /// Tapping one of the three derived columns, which says what it is rather
  /// than doing nothing at all.
  final void Function(Batch, BatchGrade, String column) onStageTap;
  final VoidCallback onClose;
  final VoidCallback onDelete;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    final marked = batch.markedCount ?? 0;
    final weighed = batch.weighedCount ?? 0;
    final ready = marked > 0 && weighed == marked;
    final outstanding = marked - weighed;

    return Panel(
      margin: const EdgeInsets.only(bottom: 10),
      accent: batch.orphaned ? T.err : _chipTone(batch),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 5,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    BatchRef(batch.ref, size: 14),
                    if (batch.machineId.isNotEmpty)
                      FormChip(batch.machineId, colour: T.ember),
                    if (batch.formulation != null) FormChip(batch.formulation!),
                    if (held) const StatePill('QC hold', tone: PillTone.down),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                batch.stateLabel ?? '',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: _chipTone(batch),
                ),
              ),
            ],
          ),

          // The pre-refiners are not a per-grade stage: they break the whole
          // charge down before the grades are split out of it.
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pre-refiners',
                style: TextStyle(fontSize: 11, color: T.inkFaint),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: batch.preRefiners.isEmpty
                    ? const Text(
                        'none yet',
                        style: TextStyle(fontSize: 11, color: T.inkFaint),
                      )
                    : Wrap(
                        spacing: 5,
                        runSpacing: 4,
                        children: [
                          for (final id in batch.preRefiners) FormChip(id),
                        ],
                      ),
              ),
            ],
          ),

          const SizedBox(height: 12),
          _GradeGrid(
            batch: batch,
            lockedReason: lockedReason,
            onToggle: onToggle,
            onStageTap: onStageTap,
          ),

          const SizedBox(height: 10),
          if (batch.orphaned)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: T.tErrBg,
                border: Border.all(color: T.tErrLine),
                borderRadius: BorderRadius.circular(T.radiusSm),
              ),
              child: const Text(
                'Orphaned. Nothing has ever been logged against this batch and '
                'it is in no autoclave — its load was most likely cancelled '
                'after the batch had been opened. It can be deleted, along with '
                'any quality tests filed against its number.',
                style: TextStyle(fontSize: 11.5, height: 1.45, color: T.err),
              ),
            )
          else
            Hint(
              batch.status == 'closed'
                  ? 'Closed and filed. It stays on the dispatch and history '
                        'record, and the back office can reopen it.'
                  : !batch.autoclaveDone
                  ? 'Unload the autoclave on the Machines tab to release this '
                        'batch to the refiners.'
                  : marked == 0
                  ? 'Tick the grades this charge will yield. Logging a run on '
                        'R4 ticks one for you.'
                  : 'Weigh each marked grade, then close the batch to file it '
                        'away.'
                        '${outstanding > 0 ? ' $outstanding still to weigh.' : ''}',
            ),

          Row(
            children: [
              Expanded(
                child: AppButton(label: 'Details', onPressed: onDetails),
              ),
              // A closed batch is here to be read, not worked: it only reaches
              // this list through the All and Closed chips, and the server
              // refuses to close, delete or re-mark it. Details is the whole of
              // what it offers, across the full width rather than beside a
              // button drawn dead for the sake of symmetry.
              if (batch.status != 'closed') ...[
                const SizedBox(width: 10),
                Expanded(
                  child: batch.orphaned
                      ? AppButton(
                          label: 'Delete batch',
                          variant: ButtonVariant.danger,
                          onPressed: onDelete,
                        )
                      : AppButton(
                          label: ready
                              ? 'Close batch ▸'
                              : marked > 0
                              ? '$weighed/$marked weighed'
                              : 'Mark grades to close',
                          variant: ready
                              ? ButtonVariant.primary
                              : ButtonVariant.ghost,
                          onPressed: onClose,
                        ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// The grade × stage grid: what the charge is marked as yielding, and how far
/// each of those grades has got. R3/R1 is refined, R4 is finished, then weighed.
class _GradeGrid extends StatelessWidget {
  const _GradeGrid({
    required this.batch,
    required this.lockedReason,
    required this.onToggle,
    required this.onStageTap,
  });

  final Batch batch;
  final String? Function(BatchGrade) lockedReason;
  final Future<void> Function(Batch, BatchGrade) onToggle;
  final void Function(Batch, BatchGrade, String column) onStageTap;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              'YIELDS?',
              style: TextStyle(
                fontSize: 9.5,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w800,
                color: T.inkFaint,
              ),
            ),
          ),
          _StageHeader('R3/R1'),
          _StageHeader('R4'),
          _StageHeader('WEIGHED'),
        ],
      ),
      const SizedBox(height: 4),
      // The rows come off the API's answer rather than off [batchQualities]:
      // which grades a charge is tracked in is not the same question for every
      // charge - a Special DRC one comes off as Special DRC or Special and as
      // nothing else - and the server has already worked it out. The constant
      // stands in only for a batch that arrived without the field.
      for (final quality
          in batch.grades.isEmpty
              ? batchQualities
              : batch.grades.map((g) => g.quality))
        Builder(
          builder: (_) {
            final row = batch.gradeRow(quality);
            final locked = lockedReason(row) != null;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: InkWell(
                      // Never disabled while a write is in flight. The tick is
                      // drawn from local state and the write states which way
                      // the grade goes rather than toggling it, so a second tap
                      // is safe - and a box that goes dead for the length of a
                      // round trip is the lag this screen had left.
                      onTap: () => onToggle(batch, row),
                      borderRadius: BorderRadius.circular(6),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Container(
                              width: 18,
                              height: 18,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: row.marked
                                    ? T.brand
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(
                                  color: row.marked
                                      ? T.brand
                                      : (locked ? T.line : T.line2),
                                ),
                              ),
                              child: row.marked
                                  ? const Icon(
                                      Icons.check,
                                      size: 13,
                                      color: T.onFill,
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 8),
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: qualityColour[quality],
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                quality,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: row.marked ? T.ink : T.inkFaint,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Derived from the runs logged against the batch, not ticked
                  // here - so a tap says so rather than doing nothing.
                  _StageDot(
                    done: row.marked && row.refined,
                    onTap: () => onStageTap(batch, row, 'R3/R1'),
                  ),
                  _StageDot(
                    done: row.marked && row.finished,
                    onTap: () => onStageTap(batch, row, 'R4'),
                  ),
                  _StageDot(
                    done: row.marked && row.weighed,
                    weighed: true,
                    onTap: () => onStageTap(batch, row, 'Weighed'),
                  ),
                ],
              ),
            );
          },
        ),
    ],
  );
}

class _StageHeader extends StatelessWidget {
  const _StageHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Text(
      label,
      textAlign: TextAlign.center,
      style: const TextStyle(
        fontSize: 9,
        letterSpacing: 0.6,
        fontWeight: FontWeight.w800,
        color: T.inkFaint,
      ),
    ),
  );
}

class _StageDot extends StatelessWidget {
  const _StageDot({
    required this.done,
    required this.onTap,
    this.weighed = false,
  });

  final bool done;
  final bool weighed;

  /// Says what this column is. There is nothing to set here - the stage comes
  /// off the runs logged against the batch - but a cell that sits in a row of
  /// tickboxes and answers a tap with nothing at all reads as broken.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: done
              ? Icon(Icons.check, size: 15, color: weighed ? T.elec : T.ok)
              : const Text('·', style: TextStyle(fontSize: 14, color: T.line2)),
        ),
      ),
    ),
  );
}

/// The whole record of one batch: what went in, who put it there, what came out
/// of each grade, what was moved between grades, the yield those two make, and
/// every run logged against the number.
class _BatchDetailBody extends StatelessWidget {
  const _BatchDetailBody({required this.detail});
  final BatchDetail detail;

  /// "crew shared with the twin vessel · 1 worker" - who charged the autoclave.
  String get _crew {
    final shared = detail.paired
        ? 'crew shared with the twin vessel'
        : 'charged alone';
    final hands = detail.workers != null
        ? '${detail.workers} worker${detail.workers == 1 ? '' : 's'}'
        : null;
    return [shared, hands].where((s) => s != null).join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final yielded = detail.grades
        .where((g) => g.marked || g.kg != null)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SheetLabel('Charge'),
        Readout(label: 'Charged with', value: kgOf(detail.capacity)),
        Readout(label: 'Crew', value: _crew),
        Readout(
          label: 'Shift',
          value: [
            detail.shift,
            if (detail.shiftDate != null) dayMonth(detail.shiftDate),
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
        ),
        Readout(label: 'Signed by', value: detail.openedBy ?? '--'),

        const SheetLabel('In the autoclave'),
        Readout(
          label: 'Loaded',
          value: detail.loadedAt != null
              ? '${dayMonth(detail.loadedAt)} ${clock24(detail.loadedAt)}'
              : '--',
        ),
        Readout(
          label: 'Unloaded',
          value: detail.unloadedAt != null
              ? '${dayMonth(detail.unloadedAt)} ${clock24(detail.unloadedAt)}'
              : 'still in the vessel',
        ),

        const SheetLabel('Per grade'),
        if (yielded.isEmpty)
          const Hint('No grades marked on this batch yet.')
        else
          for (final row in yielded)
            Readout(
              label: row.quality,
              labelWidget: QualityChip(row.quality),
              value: row.kg != null ? kgOf(row.kg) : 'not weighed',
              valueColour: row.kg == null ? T.warn : null,
            ),

        // Output over what went in. Shown as the division it is, so the figure
        // can be checked against the two lines above it rather than trusted.
        const SheetLabel('Yield'),
        Readout(label: 'Weighed out', value: kgOf(detail.weighedKg)),
        Readout(
          label: 'Yield',
          value: detail.yieldPct != null
              ? '${kgOf(detail.weighedKg)} ÷ ${kgOf(detail.capacity)} = '
                    '${num1(detail.yieldPct)}%'
              : '--',
          valueColour: detail.yieldPct != null ? T.ok : null,
        ),

        const SheetLabel('Conversions'),
        if (detail.conversions.isEmpty)
          const Hint('Nothing was moved between grades on this batch.')
        else
          for (final c in detail.conversions)
            Readout(
              label:
                  '${c.fromQuality ?? '?'} → ${c.toQuality ?? '?'}'
                  '${c.stage != null ? ' · ${c.stage}' : ''}',
              value: kgOf(c.qtyKg),
            ),

        SheetLabel('Runs', note: '— ${detail.runs.length} logged'),
        if (detail.runs.isEmpty)
          const Hint('Nothing has been logged against this batch number.')
        else
          for (final run in detail.runs)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
              decoration: BoxDecoration(
                color: T.sunken,
                borderRadius: BorderRadius.circular(T.radiusSm),
                border: Border.all(color: T.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          run.machine ?? run.machineId,
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: T.ink,
                          ),
                        ),
                      ),
                      if (run.quality != null) QualityChip(run.quality!),
                      if (run.nonProduction) ...[
                        const SizedBox(width: 5),
                        const FormChip('non-production'),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${dayMonth(run.shiftDate)} ${run.shift}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: T.inkFaint,
                          ),
                        ),
                      ),
                      Text(
                        run.endedAt != null
                            ? duration(run.runtimeMin, run.hoursRun)
                            : 'running',
                        style: const TextStyle(fontSize: 11, color: T.inkDim),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        kgOf(run.weightKg ?? run.outWeight),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: T.ink,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
      ],
    );
  }
}
