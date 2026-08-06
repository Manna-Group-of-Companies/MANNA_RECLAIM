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

/// The weigh queue: runs that finished on a machine whose output is weighed
/// (the grinders, R2, R4) and that nobody has put on the scale yet.
///
/// Material comes off in more than one barrow, so the sheet keeps a running
/// list of individual weighings and sends their total once. Until it is sent
/// the run stays here, which is what makes the tab badge trustworthy.
///
/// Below the queue is everything already weighed, newest first. A figure typed
/// wrong is found and put right there rather than waiting on the back office,
/// and the weighings the total came off are shown alongside it.
///
/// A port of client/src/pages/user/WeighPage.tsx.
class WeighPage extends StatefulWidget {
  const WeighPage({super.key});

  @override
  State<WeighPage> createState() => _WeighPageState();
}

class _WeighPageState extends State<WeighPage> {
  int _seenTick = -1;

  /// Which weighing is one tap from being cleared. One id, so arming a second
  /// disarms the first - the same two-step every destructive control uses.
  String? _confirming;
  String? _clearing;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// Both lists, because a delete can move either: a run waiting to be weighed
  /// drops off the top list, and one already weighed drops off the record below
  /// it. The re-read keeps whichever span the crew is looking at - refetching
  /// the short list would quietly close a "show all" somebody had opened.
  Future<void> _load() async {
    final runs = context.read<RunsStore>();
    await runs.fetchPendingWeigh();
    await runs.fetchWeighed(all: runs.weighedAll);
  }

  static List<double> _entriesOf(Run run) => run.weighEntries;

  static num _sum(List<num> values) =>
      round2(values.fold<num>(0, (a, b) => a + b));

  /// Where the material came from, as the crews name it. Shiftwise output
  /// belongs to a line and a day; refiner output belongs to its batch, and the
  /// time it came off is what tells two passes of the same grade apart.
  String _sourceOf(Run run) {
    if (run.quality != null) {
      final machine = run.machine ?? run.machineId;
      final at = run.endedAt != null ? ' · $machine ${clock(run.endedAt)}' : '';
      return '${run.formulation ?? machine}$at';
    }
    return '${run.line == 'grind' ? 'Grinder output' : 'Coarse'} · '
        '${dayMonth(run.shiftDate)}';
  }

  /// The line under a correction sheet's title: line, shift, day, feedstock.
  String _subtitleOf(Run run) {
    final line = run.quality != null
        ? (run.formulation ?? run.machine ?? run.machineId)
        : (run.line == 'grind' ? 'Grinder output' : 'Coarse');
    final tyre = run.tyreType != null ? tyres[run.tyreType]?.label : null;
    final feed = [tyre, run.mesh].where((s) => s != null).join(' ');
    return [
      line,
      '${run.shift} shift',
      dayMonth(run.shiftDate),
      if (feed.isNotEmpty) feed,
    ].where((s) => s.isNotEmpty).join(' · ');
  }

  /// Why the weighing on a run cannot be cleared, in the words to say it in.
  ///
  /// The same refusal the server makes, said before the tap rather than after
  /// it. The sacks in the yard were bagged against this figure, and the way to
  /// put them back is on the Packing tab - which is what the sentence names,
  /// because "cannot be cleared" on its own is a wall with no door in it.
  String? _clearBlock(Run run) {
    final packed = (run.packedPieces ?? 0) != 0
        ? run.packedPieces!
        : (run.packedSacks ?? 0);
    return packed > 0
        ? '$packed packed off this weight — undo the packing on the Packing '
              'tab first'
        : null;
  }

  Future<void> _clearWeight(Run run) async {
    final ui = context.read<UiStore>();
    setState(() => _clearing = run.id);
    final done = await context.read<RunsStore>().unweigh(run.id);
    if (!mounted) return;
    setState(() => _clearing = null);
    if (done == null) return;
    setState(() => _confirming = null);
    final cleared = done.weightKg;
    // The run is not deleted and the toast says so: what somebody has just done
    // is send a card from the bottom list to the top one, and a message that
    // only said "removed" would leave them looking for a row that is still
    // there, one list up.
    ui.notify(
      '${cleared != null ? '$cleared kg' : 'The weight'} cleared — '
      '${run.batchNo ?? run.machine ?? run.machineId} is back on the weigh '
      'queue',
    );
  }

  // ---- the weigh / correct sheet --------------------------------------

  Future<void> _openSheet(Run run, {required bool correcting}) async {
    final ui = context.read<UiStore>();
    final runs = context.read<RunsStore>();

    // A shiftwise machine banks each load as it comes off, so a run can arrive
    // here with its weighings already against it - this tab is where they are
    // totalled and filed rather than where they are all typed.
    var entries = List<num>.from(_entriesOf(run));
    final onRecord = run.weight;
    final weightField = TextEditingController();
    final totalField = TextEditingController(
      text: correcting ? numText(onRecord) : '',
    );

    /// Whatever is still in the add box - a crew that types one weight and
    /// saves, rather than "adding" it first.
    num? pendingEntry() {
      final value = num.tryParse(weightField.text.trim());
      return value != null && value > 0 ? value : null;
    }

    await showAppSheet<void>(
      context: context,
      title:
          '${correcting ? 'Correct' : 'Weigh'} '
          '${run.batchNo ?? run.machine ?? run.machineId}',
      subtitle: _subtitleOf(run),
      led: T.elec,
      body: (context, setSheetState) {
        final entriesTotal = _sum(entries);
        final corrected = round2(
          (num.tryParse(totalField.text.trim()) ?? 0) + (pendingEntry() ?? 0),
        );
        final diff = round2(corrected - onRecord);

        void applyEntries(List<num> next) {
          entries = next;
          // Banking a weighing moves the corrected total with it - they must
          // agree, or the sheet is showing two answers to one question.
          if (correcting) totalField.text = numText(_sum(next));
          setSheetState(() {});
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (correcting) ...[
              Readout(label: 'Weight on record', value: '$onRecord kg'),
              if (entries.isNotEmpty)
                Readout(
                  label:
                      'Weighings total'
                      '${entries.length > 1 ? ' · ${entries.length}' : ''}',
                  value: '$entriesTotal kg',
                  valueColour: entriesTotal == corrected ? null : T.warn,
                ),
              TextFieldRow(
                controller: totalField,
                label: 'Corrected total weight',
                suffix: 'kg',
                decimal: true,
                placeholder: numText(onRecord),
                onChanged: (_) => setSheetState(() {}),
                hint: diff == 0
                    ? 'Unchanged — still $onRecord kg.'
                    : '$onRecord kg → $corrected kg '
                          '(${diff > 0 ? '+' : ''}$diff kg).',
              ),
              if (entries.isNotEmpty && entriesTotal != corrected)
                Hint(
                  'The ${entries.length} weighing'
                  '${entries.length > 1 ? 's' : ''} below add up to '
                  '$entriesTotal kg. Both are kept — the corrected total is '
                  'what goes on record.',
                  colour: T.warn,
                ),
            ],

            if (entries.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: T.sunken,
                  borderRadius: BorderRadius.circular(T.radiusSm),
                  border: Border.all(color: T.line),
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < entries.length; i++)
                      Container(
                        decoration: BoxDecoration(
                          border: i == 0
                              ? null
                              : const Border(
                                  top: BorderSide(color: T.rule),
                                ),
                        ),
                        padding: const EdgeInsets.only(left: 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${entries[i]} kg',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: T.ink,
                                  fontFeatures: [FontFeature.tabularFigures()],
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: () => applyEntries([
                                for (var j = 0; j < entries.length; j++)
                                  if (j != i) entries[j],
                              ]),
                              icon: const Icon(Icons.close, size: 16),
                              color: T.inkFaint,
                              tooltip: 'Remove ${entries[i]} kg',
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFieldRow(
                    controller: weightField,
                    label: correcting ? 'Add another weighing' : 'Weighing',
                    suffix: 'kg',
                    decimal: true,
                    placeholder: '0',
                    onChanged: (_) => setSheetState(() {}),
                    onSubmitted: (_) {
                      final value = pendingEntry();
                      if (value == null) {
                        ui.notify('Enter a weight above zero', ToastKind.warn);
                        return;
                      }
                      weightField.clear();
                      applyEntries([...entries, value]);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(top: 20),
                  child: AppButton(
                    label: '+ Add',
                    variant: ButtonVariant.elec,
                    onPressed: () {
                      final value = pendingEntry();
                      if (value == null) {
                        ui.notify('Enter a weight above zero', ToastKind.warn);
                        return;
                      }
                      weightField.clear();
                      // Drop the focus so the number pad comes off the sheet's
                      // actions - it comes back when the field is tapped.
                      FocusScope.of(context).unfocus();
                      applyEntries([...entries, value]);
                    },
                  ),
                ),
              ],
            ),

            if (!correcting) ...[
              Readout(label: 'Total', value: '${_sum(entries)} kg'),
              Hint(
                _entriesOf(run).isNotEmpty
                    ? 'Tallied while the machine ran — correct the list if '
                          'needed, then save.'
                    : 'Add each barrow as it comes off the scale, or type one '
                          'weight and save.',
              ),
            ],
          ],
        );
      },
      actions: (context, setSheetState) => [
        AppButton(
          label: correcting ? 'Close' : 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: correcting ? 'Save correction' : 'Save weight',
          variant: ButtonVariant.primary,
          onPressed: () async {
            final extra = pendingEntry();
            final all = extra != null ? [...entries, extra] : entries;
            final saved = correcting
                ? round2(
                    (num.tryParse(totalField.text.trim()) ?? 0) + (extra ?? 0),
                  )
                : _sum(all);

            if (saved == 0) {
              ui.notify(
                correcting
                    ? 'Enter the corrected weight in kg'
                    : 'Enter the weight in kg',
                ToastKind.warn,
              );
              return;
            }
            if (correcting &&
                saved == onRecord &&
                _sum(all) == _sum(_entriesOf(run))) {
              ui.notify('Nothing changed on this run', ToastKind.warn);
              return;
            }

            final result = await runs.weigh(run.id, saved, all);
            if (result == null) return;
            ui.notify(
              correcting ? 'Corrected to $saved kg' : '$saved kg recorded',
            );
            if (context.mounted) Navigator.of(context).pop();
          },
        ),
      ],
    );

    weightField.dispose();
    totalField.dispose();
  }

  // ---- the page --------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final runs = context.watch<RunsStore>();
    // The admin account and nobody else, manager included - see deleteRoles.
    // Correcting a figure is the crew's and always has been, because the scale
    // is theirs and doing it again undoes it. Clearing one is a different act:
    // the run goes back to owing a weight and no screen puts it back.
    final mayClear = context.watch<AuthStore>().mayDelete;

    if (runs.loading && runs.pendingWeigh.isEmpty && runs.weighed.isEmpty) {
      return const PageLoader(label: 'Loading runs');
    }

    if (runs.pendingWeigh.isEmpty && runs.weighed.isEmpty) {
      return ListView(
        children: const [
          ViewHead(title: 'Weigh'),
          EmptyState(
            icon: Icons.monitor_weight_outlined,
            title: 'Nothing to weigh',
            hint: 'Finish a run on R4, a coarse R2 shift or a grinder shift and '
                'it lands here.',
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          ViewHead(
            title: 'Weigh',
            meta: Text(
              '${runs.pendingWeigh.length} pending · '
              '${runs.weighedTotal} weighed',
            ),
          ),

          if (runs.pendingWeigh.isEmpty)
            const EmptyState(
              icon: Icons.monitor_weight_outlined,
              title: 'Nothing to weigh',
              hint: 'Everything that has come off the machines is on the scale '
                  'record below.',
            )
          else
            for (final run in runs.pendingWeigh)
              Panel(
                margin: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(child: _RunLine(run: run, sub: _pendingSub(run))),
                    const SizedBox(width: 10),
                    AppButton(
                      label: 'Weigh ▸',
                      variant: ButtonVariant.primary,
                      onPressed: () => _openSheet(run, correcting: false),
                    ),
                  ],
                ),
              ),

          if (runs.weighed.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 8),
              child: Row(
                children: [
                  const Text(
                    'Weighed',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: T.ink,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      runs.weighedAll || runs.weighedTotal <= weighedPage
                          ? '— all ${runs.weighedTotal}'
                          : '— latest ${runs.weighed.length} of '
                                '${runs.weighedTotal}',
                      style: const TextStyle(fontSize: 11, color: T.inkFaint),
                    ),
                  ),
                  if (runs.weighedTotal > runs.weighed.length || runs.weighedAll)
                    AppButton(
                      dense: true,
                      label: runs.weighedAll
                          ? 'Show latest $weighedPage'
                          : 'Show all ${runs.weighedTotal}',
                      onPressed: () => runs.fetchWeighed(all: !runs.weighedAll),
                    ),
                ],
              ),
            ),

            for (final run in runs.weighed)
              Builder(
                builder: (_) {
                  final count = _entriesOf(run).length;
                  final blocked = _clearBlock(run);
                  final armed = _confirming == run.id;
                  return Panel(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: _RunLine(
                                run: run,
                                sub:
                                    '${run.weight} kg · ${_sourceOf(run)}'
                                    '${count > 0 ? ' · $count weighing${count > 1 ? 's' : ''}' : ''}',
                                subColour: T.ok,
                              ),
                            ),
                            const SizedBox(width: 8),
                            if (!armed)
                              AppButton(
                                dense: true,
                                label: 'Correct ▸',
                                onPressed: () =>
                                    _openSheet(run, correcting: true),
                              ),
                          ],
                        ),

                        // Said beside the armed button rather than left to the
                        // toast afterwards: the run does not go anywhere, it
                        // goes back to the queue at the top of this screen, and
                        // that is the part somebody pressing Delete is least
                        // likely to have in mind.
                        if (armed)
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Hint(
                              'The run stays — it goes back to the weigh queue '
                              'above, owing a weight.',
                            ),
                          ),
                        if (mayClear && blocked != null && !armed)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Hint(blocked),
                          ),

                        // Back office only, and drawn dead rather than hidden
                        // once the weight has been packed against - a button
                        // that is not there is a question, and this one already
                        // knows the answer.
                        if (mayClear)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: armed
                                ? Row(
                                    children: [
                                      AppButton(
                                        dense: true,
                                        label: 'Yes, clear it',
                                        variant: ButtonVariant.danger,
                                        loading: _clearing == run.id,
                                        onPressed: () => _clearWeight(run),
                                      ),
                                      const SizedBox(width: 8),
                                      AppButton(
                                        dense: true,
                                        label: 'Cancel',
                                        onPressed: () =>
                                            setState(() => _confirming = null),
                                      ),
                                    ],
                                  )
                                : Align(
                                    alignment: Alignment.centerLeft,
                                    child: AppButton(
                                      dense: true,
                                      label: 'Delete',
                                      tooltip:
                                          blocked ??
                                          'Clear this weighing and put the run '
                                              'back on the queue',
                                      onPressed: blocked != null
                                          ? null
                                          : () => setState(
                                              () => _confirming = run.id,
                                            ),
                                    ),
                                  ),
                          ),
                      ],
                    ),
                  );
                },
              ),
          ],
        ],
      ),
    );
  }

  String _pendingSub(Run run) =>
      '${run.machine ?? run.machineId} · ${dayMonth(run.shiftDate)} · '
      '${duration(run.runtimeMin, run.hoursRun)}'
      '${run.endedAt != null ? ' · ${clock(run.endedAt)}' : ''}';
}

/// One card's identity line: the reference, the grade or the shift, the mesh.
class _RunLine extends StatelessWidget {
  const _RunLine({required this.run, required this.sub, this.subColour});
  final Run run;
  final String sub;
  final Color? subColour;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        spacing: 6,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          BatchRef(run.batchNo ?? run.machine ?? run.machineId),
          if (run.quality != null)
            QualityChip(run.quality!)
          else
            StatePill(run.shift, tone: PillTone.shift),
          if (run.mesh != null) FormChip(run.mesh!, colour: T.steel),
        ],
      ),
      const SizedBox(height: 5),
      Text(
        sub,
        style: TextStyle(
          fontSize: 11.5,
          height: 1.35,
          color: subColour ?? T.inkFaint,
        ),
      ),
    ],
  );
}
