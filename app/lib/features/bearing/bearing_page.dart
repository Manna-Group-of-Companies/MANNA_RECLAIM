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

/// The greasing schedule in one place.
///
/// A machine is only *due* while it is actually turning - an idle machine shows
/// as idle rather than nagging - so this reads the active runs alongside the
/// schedule. A port of client/src/pages/user/BearingPage.tsx.
class BearingPage extends StatefulWidget {
  const BearingPage({super.key});

  @override
  State<BearingPage> createState() => _BearingPageState();
}

class _BearingPageState extends State<BearingPage> {
  int _seenTick = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final maintenance = context.read<MaintenanceStore>();
    final machines = context.read<MachinesStore>();
    final runs = context.read<RunsStore>();
    await machines.fetch();
    await runs.fetchActive();
    await maintenance.fetchDue();
    await maintenance.fetchBearingLogs();
  }

  /// The last reading per machine and position, so each row can say what it was
  /// and how long ago. The logs come back newest first, so the first one seen
  /// for a key is the one that stands.
  Map<String, ({num? temp, String ts})> _lastReadings(List<BearingLog> logs) {
    final map = <String, ({num? temp, String ts})>{};
    for (final log in logs) {
      final key = '${log.machineId}|${log.position}';
      map.putIfAbsent(key, () => (temp: log.tempC, ts: log.ts));
    }
    return map;
  }

  ({String label, Color colour}) _statusOf(
    BearingDue row,
    Set<String> running,
  ) {
    if (!running.contains(row.machineId)) {
      return (label: 'idle', colour: T.inkFaint);
    }
    if (row.lastAt == null) return (label: 'never logged', colour: T.err);
    if (row.due) {
      return (label: 'overdue ${minutesLabel(row.dueInMin)}', colour: T.warn);
    }
    return (label: 'due in ${minutesLabel(row.dueInMin)}', colour: T.ok);
  }

  Future<void> _openSheet(BearingDue row) async {
    final maintenance = context.read<MaintenanceStore>();
    final ui = context.read<UiStore>();
    final last = _lastReadings(maintenance.bearings);

    final temps = {
      for (final position in row.positions) position: TextEditingController(),
    };
    var readingTime = '';

    await showAppSheet<void>(
      context: context,
      title:
          '${row.bearingType == 'bush' ? 'Bush' : 'Bearing'} temps — '
          '${row.machine ?? row.machineId}',
      subtitle:
          '${row.positions.length} ${row.bearingType}s · every '
          '${row.intervalH} hours while running · '
          '${row.lastAt != null ? 'last ${ago(row.lastAt)}' : 'not logged yet'}',
      led: T.elec,
      body: (context, setSheetState) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (row.due) const Hint('⚠ Overdue — log now.', colour: T.warn),
          // Two across on a sheet wide enough to hold them, one per row on a
          // phone - a machine with four bearings should not need a scroll in
          // the middle of a set of readings.
          FieldColumns(
            children: [
              for (final position in row.positions)
                Builder(
                  builder: (_) {
                    final was = last['${row.machineId}|$position'];
                    return TextFieldRow(
                      controller: temps[position]!,
                      label:
                          '${row.bearingType == 'bush' ? 'Bush' : 'Bearing'} $position',
                      note: was != null
                          ? '— last ${was.temp ?? '--'}°C, ${ago(was.ts)}'
                          : null,
                      suffix: '°C',
                      placeholder: 'temperature',
                      decimal: true,
                    );
                  },
                ),
            ],
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
      actions: (context, setSheetState) => [
        AppButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AppButton(
          label: 'Log temperatures',
          variant: ButtonVariant.primary,
          onPressed: () async {
            final readings = <({String position, num tempC})>[];
            for (final position in row.positions) {
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
              machineId: row.machineId,
              machine: row.machine,
              kind: row.bearingType,
              readings: readings,
              supervisor: ui.supervisorName.isEmpty ? null : ui.supervisorName,
              shiftDate: todayISO(),
              shift: currentShift(),
              // A blank time means "just read"; a time is read as today's clock,
              // rolled back a day if that would put the reading in the future.
              ts: todayAtOrYesterday(readingTime),
            );
            if (okay) {
              ui.notify('${row.machine ?? row.machineId} temps logged');
              await maintenance.fetchBearingLogs();
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

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<UiStore>().refreshTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final maintenance = context.watch<MaintenanceStore>();
    final machines = context.watch<MachinesStore>();
    final running = context
        .watch<RunsStore>()
        .active
        .map((r) => r.machineId)
        .toSet();
    final last = _lastReadings(maintenance.bearings);

    if (machines.loading && machines.items.isEmpty) {
      return const PageLoader(label: 'Loading schedule');
    }

    if (maintenance.due.isEmpty) {
      return ListView(
        children: const [
          ViewHead(title: 'Bearing'),
          EmptyState(
            icon: Icons.thermostat_rounded,
            title: 'No greasing schedule',
            hint:
                'Machines with bearings or bushes appear here once they are '
                'configured.',
          ),
        ],
      );
    }

    // Only a machine that is actually turning counts as overdue - the whole
    // point of reading the active runs beside the schedule.
    final overdue = maintenance.due
        .where((d) => d.due && running.contains(d.machineId))
        .length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          ViewHead(
            title: 'Bearing',
            meta: Text(overdue > 0 ? '$overdue overdue' : 'all logged'),
          ),
          CardGrid(
            children: [
              for (final row in maintenance.due)
                Builder(
                  builder: (_) {
                    final status = _statusOf(row, running);
                    final urgent =
                        status.colour == T.warn || status.colour == T.err;
                    return Panel(
                      margin: const EdgeInsets.only(bottom: 10),
                      accent: status.colour,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  row.machine ?? row.machineId,
                                  style: const TextStyle(
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w700,
                                    color: T.ink,
                                  ),
                                ),
                              ),
                              Text(
                                status.label,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: status.colour,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${row.positions.length} ${row.bearingType}s · every '
                            '${row.intervalH}h',
                            style: const TextStyle(
                              fontSize: 11,
                              color: T.inkFaint,
                            ),
                          ),
                          const SizedBox(height: 10),
                          for (final position in row.positions)
                            Builder(
                              builder: (_) {
                                final was = last['${row.machineId}|$position'];
                                return Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 3,
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          '${row.bearingType == 'bush' ? 'Bush' : 'Bearing'} $position',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: T.inkDim,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        was != null
                                            ? '${was.temp ?? '--'}°C · ${ago(was.ts)}'
                                            : 'no reading',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: was != null
                                              ? T.ink
                                              : T.inkFaint,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          const SizedBox(height: 12),
                          AppButton(
                            label: 'Log temperatures',
                            expand: true,
                            variant: urgent
                                ? ButtonVariant.primary
                                : ButtonVariant.ghost,
                            onPressed: () => _openSheet(row),
                          ),
                        ],
                      ),
                    );
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}
