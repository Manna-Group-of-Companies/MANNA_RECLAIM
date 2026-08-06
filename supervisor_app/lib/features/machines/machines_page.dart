import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../state/runs_store.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/fields.dart';
import '../../widgets/sheet.dart';
import '../../widgets/supervisor_pick.dart';
import '../../widgets/ui.dart';
import 'machine_card.dart';
import 'machine_rules.dart';
import 'start_sheet.dart';
import 'stop_sheet.dart';

/// The landing tab: every machine grouped by line, with the whole run
/// lifecycle - start, pause, tally, stop, breakdown, repair, bearings.
///
/// A port of client/src/pages/user/MachinesPage.tsx. The sheets themselves live
/// in start_sheet.dart and stop_sheet.dart; what is here is the list, the four
/// smaller sheets, and the bookkeeping that decides which run a card leads on.
class MachinesPage extends StatefulWidget {
  const MachinesPage({super.key});

  @override
  State<MachinesPage> createState() => _MachinesPageState();
}

class _MachinesPageState extends State<MachinesPage> {
  int _seenTick = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final machines = context.read<MachinesStore>();
    final runs = context.read<RunsStore>();
    final maintenance = context.read<MaintenanceStore>();
    final batches = context.read<BatchesStore>();
    final products = context.read<ProductsStore>();

    await machines.fetch();
    await runs.fetchActive();
    await maintenance.fetchOpen();
    await maintenance.fetchDue();
    // Feeds the "last run" line under an idle machine, and the meter readings
    // the refiner start sheet pre-fills from.
    await runs.fetchShift();
    // The batches the refiners can be pointed at.
    await batches.fetchOpen();
    // And what the presses mould.
    await products.fetch();
  }

  /// Every open run a machine has, oldest first - and the one its card shows.
  ///
  /// A machine is meant to have one run open and normally does. It can end up
  /// with several: starting is a check for an open run and then an insert, with
  /// a round trip in between, so a Start that fires twice - a double tap, a
  /// retry after a slow reply - can put both requests through the check before
  /// either row lands. The server removes the loser of that race now and the
  /// database refuses it outright, but rows made before either are still out
  /// there.
  ///
  /// They have to be visible here or they cannot be got rid of: a card keys on
  /// the machine, so extra rows are invisible on this screen, and stopping the
  /// one the card holds only lets the next take its place - which on the floor
  /// reads as a machine that will not stop. So the card leads on the oldest,
  /// which is the run the crew watched start, and the cancel sheet clears the
  /// whole set at once.
  Map<String, List<Run>> _openByMachine(List<Run> active) {
    final map = <String, List<Run>>{};
    for (final r in active) {
      map.putIfAbsent(r.machineId, () => []).add(r);
    }
    for (final list in map.values) {
      list.sort((a, b) => a.startedAt.compareTo(b.startedAt));
    }
    return map;
  }

  // ---- the four smaller sheets ----------------------------------------

  /// Which line a coarse-line machine is on this time. The answer is what opens
  /// the start sheet.
  Future<void> _askLine(Machine machine) async {
    final line = await showAppSheet<String>(
      context: context,
      title: 'Start ${machine.name}',
      subtitle:
          'Is ${machine.short} running the coarse line or the special line '
          'this time?',
      led: T.brand,
      body: (context, _) => PickGrid(
        children: [
          Pick(
            title: 'Coarse line',
            sub: 'default · shiftwise coarse output',
            onTap: () => Navigator.of(context).pop('coarse'),
          ),
          Pick(
            title: 'Special line',
            sub: 'refine a batch · any quality',
            onTap: () => Navigator.of(context).pop('special'),
          ),
        ],
      ),
      actions: (context, _) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
    if (line != null && mounted) await _openStart(machine, line: line);
  }

  Future<void> _openStart(Machine machine, {String? line}) async {
    final last = _lastByMachine()[machine.id];
    final started = await showStartSheet(
      context: context,
      machine: machine,
      line: line,
      previous: last,
    );
    if (started == true && mounted) {
      await context.read<RunsStore>().fetchActive();
    }
  }

  Future<void> _openStop(Run run) async {
    final machine = context.read<MachinesStore>().byId(run.machineId);
    final result = await showStopSheet(
      context: context,
      run: run,
      machine: machine,
    );
    if (!mounted || result == null) return;
    if (result.cancelRequested) await _confirmCancel(run);
  }

  /// Throws the run away - and every other row left open on the same machine.
  ///
  /// One tap that was recorded several times is one mistake, not seven, and it
  /// is cancelled once: cancelling only the row on the card would hand the card
  /// to the next duplicate and leave the crew tapping until the machine finally
  /// goes idle, with no way of knowing how many taps that is.
  Future<void> _confirmCancel(Run run) async {
    final ui = context.read<UiStore>();
    final runs = context.read<RunsStore>();
    final open = _openByMachine(runs.active)[run.machineId] ?? [run];
    final label = run.machine ?? run.machineId;

    final go = await confirmSheet(
      context: context,
      title: 'Cancel this load?',
      subtitle: [
        run.machine ?? run.machineId,
        run.batchNo,
        run.formulation,
      ].where((s) => s != null && s.isNotEmpty).join(' · '),
      body:
          'Removes the run from $label. Nothing is logged — use it only if the '
          'run was started by mistake.'
          '${open.length > 1 ? ' This machine has ${open.length} runs open — one Start that was recorded ${open.length} times. All ${open.length} go.' : ''}',
      keepLabel: 'Keep loaded',
      goLabel: open.length > 1
          ? 'Yes, cancel all ${open.length}'
          : 'Yes, cancel load',
    );
    if (!go) return;

    var cancelled = 0;
    for (final r in open) {
      if (await runs.cancel(r.id)) cancelled += 1;
    }
    final okay = cancelled == open.length;
    ui.notify(
      okay
          ? (open.length > 1
                ? '$label: ${open.length} open runs cancelled — nothing logged'
                : '$label load cancelled — nothing logged')
          : cancelled > 0
          ? '$label: $cancelled of ${open.length} cancelled — try again for the '
                'rest'
          : 'Could not cancel the load',
      okay ? ToastKind.ok : ToastKind.err,
    );
  }

  /// The running tally on a machine that is still going.
  ///
  /// The whole list goes to the server each time, so adding a load and taking
  /// one back off are the same write. Nothing is weighed by it - the figure of
  /// record is still settled in the Weigh tab once the machine has stopped.
  Future<void> _openTally(Run run) async {
    final ui = context.read<UiStore>();
    final runs = context.read<RunsStore>();
    final add = TextEditingController();

    await showAppSheet<void>(
      context: context,
      title: 'Add weight — ${run.machine ?? run.machineId}',
      subtitle: [
        run.line == 'grind' ? 'Grinder output' : 'Coarse',
        run.shift,
        dayMonth(run.shiftDate),
        run.mesh,
      ].where((s) => s != null && s.isNotEmpty).join(' · '),
      led: T.elec,
      body: (context, setSheetState) {
        // Read back off the store each build, so removing an entry redraws the
        // list from what the server actually kept.
        final live = runs.active.firstWhere(
          (r) => r.id == run.id,
          orElse: () => run,
        );
        final entries = live.weighEntries;
        final total = round2(entries.fold<num>(0, (a, b) => a + b));

        Future<void> save(List<num> next) async {
          final okay = await runs.tally(run.id, next);
          if (!okay) ui.notify('Could not save the weighing', ToastKind.err);
          setSheetState(() {});
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Readout(
              label: 'Running total',
              value: '$total kg',
              valueColour: T.elec,
            ),
            if (entries.isEmpty)
              const Hint(
                'Add each load as it comes off — they keep adding up while the '
                'machine runs. Finalise & submit in the Weigh tab after you '
                'stop it.',
              )
            else
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
                              : const Border(top: BorderSide(color: T.rule)),
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
                              onPressed: () => save([
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
            const SheetLabel('Add a weighing'),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFieldRow(
                    controller: add,
                    suffix: 'kg',
                    decimal: true,
                    placeholder: '0',
                  ),
                ),
                const SizedBox(width: 8),
                AppButton(
                  label: '+ Add',
                  variant: ButtonVariant.elec,
                  onPressed: () {
                    final value = asNumber(add.text);
                    if (value == null || value <= 0) {
                      ui.notify('Enter a weight above zero', ToastKind.warn);
                      return;
                    }
                    add.clear();
                    FocusScope.of(context).unfocus();
                    save([...entries, round2(value)]);
                  },
                ),
              ],
            ),
          ],
        );
      },
      actions: (context, _) => [
        AppButton(
          label: 'Done',
          variant: ButtonVariant.primary,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );

    add.dispose();
  }

  /// Report a breakdown. The machine is flagged DOWN and cannot be started
  /// until the repair is logged; downtime counts from the time given.
  Future<void> _openBreakdown(Machine machine) async {
    final ui = context.read<UiStore>();
    final maintenance = context.read<MaintenanceStore>();
    var downTime = '';

    await showAppSheet<void>(
      context: context,
      title: 'Report breakdown — ${machine.name}?',
      subtitle:
          'The machine is flagged DOWN in red and cannot be started until the '
          'repair is logged. Down-time counts from the time below.',
      led: T.err,
      body: (context, setSheetState) => TimeFieldRow(
        label: 'Breakdown time',
        note: '— leave blank for now',
        value: downTime,
        onChanged: (v) => setSheetState(() => downTime = v),
      ),
      actions: (context, _) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: 'Mark down',
          variant: ButtonVariant.danger,
          onPressed: () async {
            final okay = await maintenance.markDown(
              machineId: machine.id,
              machine: machine.name,
              // A blank time means "it just happened"; a time is read as
              // today's clock, rolled back a day if that would put the
              // breakdown in the future.
              downStart: todayAtOrYesterday(downTime),
            );
            if (okay) {
              ui.notify('${machine.short} marked DOWN');
              if (context.mounted) Navigator.of(context).pop();
            }
          },
        ),
      ],
    );
  }

  /// Log the repair. All three answers are required - cause, fix, and what
  /// stops it recurring - because that is the whole point of the record.
  Future<void> _openRepair(MaintenanceLog log) async {
    final ui = context.read<UiStore>();
    final maintenance = context.read<MaintenanceStore>();
    final rootCause = TextEditingController();
    final resolution = TextEditingController();
    final prevention = TextEditingController();

    await showAppSheet<void>(
      context: context,
      title: 'Log repair — ${log.machine ?? log.machineId}',
      subtitle: log.downStart != null
          ? 'Down for ${elapsed(log.downStart)}. Complete the log to bring it '
                'back online.'
          : null,
      led: T.err,
      body: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFieldRow(
            controller: rootCause,
            label: '1 · Root cause of the breakdown',
            maxLines: 2,
            placeholder: 'What actually caused it?',
          ),
          TextFieldRow(
            controller: resolution,
            label: '2 · How was the issue resolved?',
            maxLines: 2,
            placeholder: 'What was done to fix it?',
          ),
          TextFieldRow(
            controller: prevention,
            label: '3 · Steps so it never persists',
            maxLines: 2,
            placeholder: 'Preventive action / checks added',
          ),
        ],
      ),
      actions: (context, _) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: 'Mark repaired',
          variant: ButtonVariant.primary,
          onPressed: () async {
            if (rootCause.text.trim().isEmpty ||
                resolution.text.trim().isEmpty ||
                prevention.text.trim().isEmpty) {
              ui.notify('Fill in all three questions', ToastKind.warn);
              return;
            }
            final okay = await maintenance.logRepair(
              log.id,
              rootCause: rootCause.text.trim(),
              resolution: resolution.text.trim(),
              prevention: prevention.text.trim(),
            );
            if (okay) {
              ui.notify('Back online · logged');
              if (context.mounted) Navigator.of(context).pop();
            }
          },
        ),
      ],
      after: (context, _) => AppButton(
        label: 'Cancel this breakdown (entered by mistake)',
        variant: ButtonVariant.danger,
        expand: true,
        onPressed: () async {
          final okay = await maintenance.cancelDown(log.id);
          if (okay) {
            ui.notify('Breakdown cancelled — nothing logged');
            if (context.mounted) Navigator.of(context).pop();
          }
        },
      ),
    );

    rootCause.dispose();
    resolution.dispose();
    prevention.dispose();
  }

  /// Bearing and bush temperatures, from the machine card rather than the
  /// Bearing tab - the crew is standing at the machine when they take them.
  Future<void> _openBearing(Machine machine, BearingDue due) async {
    final ui = context.read<UiStore>();
    final maintenance = context.read<MaintenanceStore>();
    final temps = {
      for (final position in due.positions) position: TextEditingController(),
    };
    var readingTime = '';

    await showAppSheet<void>(
      context: context,
      title:
          '${due.bearingType == 'bush' ? 'Bush' : 'Bearing'} temps — '
          '${machine.name}',
      subtitle:
          '${due.positions.length} ${due.bearingType}s · log every '
          '${due.intervalH} hours while running · '
          '${due.lastAt != null ? 'last ${ago(due.lastAt)}' : 'not logged yet'}',
      led: T.elec,
      body: (context, setSheetState) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (due.due) const Hint('⚠ Overdue — log now.', colour: T.warn),
          for (final position in due.positions)
            TextFieldRow(
              controller: temps[position]!,
              label:
                  '${due.bearingType == 'bush' ? 'Bush' : 'Bearing'} $position',
              suffix: '°C',
              decimal: true,
              placeholder: 'temperature',
            ),
          TimeFieldRow(
            label: 'Reading time',
            note: '— leave blank for now',
            value: readingTime,
            onChanged: (v) => setSheetState(() => readingTime = v),
          ),
          SupervisorPick(
            note: '— signs these temperatures',
            onChanged: () => setSheetState(() {}),
          ),
        ],
      ),
      actions: (context, _) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: 'Log temperatures',
          variant: ButtonVariant.primary,
          onPressed: () async {
            final readings = <({String position, num tempC})>[];
            for (final position in due.positions) {
              final text = temps[position]!.text.trim();
              if (text.isEmpty) continue;
              final value = num.tryParse(text);
              if (value == null || value <= 0) {
                ui.notify('Temperatures must be above zero', ToastKind.warn);
                return;
              }
              readings.add((position: position, tempC: value));
            }
            if (readings.isEmpty) {
              ui.notify('Enter at least one temperature', ToastKind.warn);
              return;
            }
            final okay = await maintenance.logBearings(
              machineId: machine.id,
              machine: machine.name,
              kind: due.bearingType,
              readings: readings,
              supervisor: ui.supervisorName.isEmpty ? null : ui.supervisorName,
              shiftDate: todayISO(),
              shift: currentShift(),
              ts: todayAtOrYesterday(readingTime),
            );
            if (okay) {
              ui.notify('${machine.short} ${due.bearingType} temps logged');
              if (context.mounted) Navigator.of(context).pop();
            }
          },
        ),
      ],
    );

    for (final c in temps.values) {
      c.dispose();
    }
  }

  Map<String, Run> _lastByMachine() {
    final map = <String, Run>{};
    for (final run in context.read<RunsStore>().shift) {
      if (run.endedAt != null && !map.containsKey(run.machineId)) {
        map[run.machineId] = run;
      }
    }
    return map;
  }

  // ---- the page --------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final machines = context.watch<MachinesStore>();
    final runs = context.watch<RunsStore>();
    final maintenance = context.watch<MaintenanceStore>();

    if (machines.loading && machines.groups.isEmpty) {
      return const PageLoader(label: 'Loading machines');
    }

    if (machines.groups.isEmpty) {
      return ListView(
        children: const [
          ViewHead(title: 'Machines'),
          EmptyState(
            title: 'No machines configured',
            hint: 'Add machines from the back office to see them here.',
          ),
        ],
      );
    }

    final openByMachine = _openByMachine(runs.active);
    final runByMachine = <String, Run>{
      for (final entry in openByMachine.entries)
        if (entry.value.isNotEmpty) entry.key: entry.value.first,
    };
    final lastByMachine = <String, Run>{};
    for (final run in runs.shift) {
      if (run.endedAt != null && !lastByMachine.containsKey(run.machineId)) {
        lastByMachine[run.machineId] = run;
      }
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          const ViewHead(title: 'Machines'),
          for (final entry in machines.groups.entries)
            Builder(
              builder: (_) {
                final runningHere = entry.value
                    .where((m) => runByMachine.containsKey(m.id))
                    .length;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionHead(
                      entry.key,
                      count: runningHere > 0 ? '$runningHere running' : null,
                    ),
                    for (final machine in entry.value)
                      MachineCard(
                        machine: machine,
                        run: runByMachine[machine.id],
                        down: maintenance.downFor(machine.id),
                        last: lastByMachine[machine.id],
                        bearing: maintenance.dueFor(machine.id),
                        // A machine that can be on either line asks which one
                        // first; the answer is what opens the start sheet.
                        onStart: (m) =>
                            isDualLine(m) ? _askLine(m) : _openStart(m),
                        onStop: _openStop,
                        onPause: (r, paused) async {
                          final ui = context.read<UiStore>();
                          final okay = await context.read<RunsStore>().pause(
                            r.id,
                            paused,
                          );
                          if (okay) {
                            ui.notify(paused ? 'Run paused' : 'Run resumed');
                          }
                        },
                        onTally: _openTally,
                        onBreakdown: _openBreakdown,
                        onRepair: _openRepair,
                        onBearing: (m) {
                          final due = maintenance.dueFor(m.id);
                          if (due != null) _openBearing(m, due);
                        },
                      ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}
