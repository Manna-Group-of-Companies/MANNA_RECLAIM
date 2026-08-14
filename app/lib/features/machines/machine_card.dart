import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/theme/tokens.dart';
import '../../core/utils/dates.dart';
import '../../core/utils/formats.dart';
import '../../widgets/ui.dart';

/// One machine, in the three states it can be in: running (timer + pause), down
/// (red rail + repair prompt), or idle (what it last did + a start CTA).
///
/// Tapping the card body is the primary action for each state, so the crew can
/// work it with gloves on; the small square buttons are the secondary ones.
///
/// A port of client/src/features/machines/MachineCard.tsx.
class MachineCard extends StatefulWidget {
  const MachineCard({
    super.key,
    required this.machine,
    this.run,
    this.down,
    this.last,
    this.bearing,
    required this.onStart,
    required this.onStop,
    required this.onPause,
    required this.onBreakdown,
    required this.onRepair,
    required this.onBearing,
    required this.onTally,
  });

  final Machine machine;
  final Run? run;

  /// The open breakdown, if this machine is currently flagged DOWN.
  final MaintenanceLog? down;

  /// The last run on this machine, shown on the idle line.
  final Run? last;
  final BearingDue? bearing;

  final void Function(Machine) onStart;
  final void Function(Run) onStop;
  final void Function(Run, bool paused) onPause;
  final void Function(Machine) onBreakdown;
  final void Function(MaintenanceLog) onRepair;
  final void Function(Machine) onBearing;

  /// Opens the running tally on a shiftwise machine whose output is weighed.
  final void Function(Run) onTally;

  @override
  State<MachineCard> createState() => _MachineCardState();
}

class _MachineCardState extends State<MachineCard> {
  Timer? _ticker;

  /// Whether this card is on the tab being looked at.
  ///
  /// The shell keeps every tab built - that is what makes switching between
  /// them instant - so without this a running machine's timer goes on firing
  /// once a second while the crew is three tabs away ticking grades, and the
  /// jank lands on whatever they are actually touching. `TickerMode` is the
  /// framework's own signal for exactly this, and the shell sets it.
  bool _visible = true;

  bool get _counting =>
      _visible &&
      ((widget.run != null && !widget.run!.paused) || widget.down != null);

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TickerMode.valuesOf(context).enabled;
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant MachineCard old) {
    super.didUpdateWidget(old);
    _syncTicker();
  }

  /// Only tick while something is actually counting up, on a tab somebody is
  /// looking at. A plant full of cards redrawing every second for machines that
  /// are idle - or for a tab nobody is on - is a battery bill with no reader.
  void _syncTicker() {
    if (_counting && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else if (!_counting) {
      _ticker?.cancel();
      _ticker = null;
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Whether this run keeps a running tally: a machine run for a shift whose
  /// output is weighed afterwards, so each load is banked as it comes off
  /// rather than remembered until the shift ends. That is the coarse refiner
  /// and the grinders - never a batch pass, which is weighed once against its
  /// batch.
  bool get _tallies =>
      widget.machine.outWeight &&
      (widget.run?.line == 'coarse' || widget.run?.line == 'grind');

  @override
  Widget build(BuildContext context) {
    final machine = widget.machine;
    final run = widget.run;
    final down = widget.down;
    final running = run != null;
    final paused = run?.paused ?? false;
    final isDown = down != null;

    final accent =
        (machine.accent != null ? _parseAccent(machine.accent!) : null) ??
        kindAccent[machine.kind] ??
        T.line2;

    final pill = isDown
        ? 'DOWN'
        : running
        ? (paused ? 'Paused' : 'Running')
        : 'Idle';
    final tone = isDown
        ? PillTone.down
        : running
        ? (paused ? PillTone.paused : PillTone.run)
        : PillTone.neutral;

    final sub =
        machine.sub ??
        (machine.kind == 'autoclave' && machine.capacity != null
            ? '${machine.capacity} kg'
            : '');

    final tally = run?.weighEntries ?? const <double>[];
    final tallied = tally.isEmpty
        ? 0
        : round2(tally.fold<num>(0, (a, b) => a + b));

    return Panel(
      margin: const EdgeInsets.only(bottom: 10),
      accent: isDown ? T.err : accent,
      active: running && !paused,
      padding: const EdgeInsets.fromLTRB(12, 11, 10, 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(right: 9),
                decoration: BoxDecoration(
                  color: isDown
                      ? T.err
                      : running
                      ? (paused ? T.warn : T.ok)
                      : T.line2,
                  shape: BoxShape.circle,
                ),
              ),
              Expanded(
                child: InkWell(
                  onTap: () {
                    if (isDown) return widget.onRepair(down);
                    if (run != null) return widget.onStop(run);
                    widget.onStart(machine);
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        machine.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: T.ink,
                        ),
                      ),
                      if (sub.isNotEmpty)
                        Text(
                          sub,
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: T.inkFaint,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              if (!isDown && _tallies && run != null)
                _SquareButton(
                  icon: Icons.scale_outlined,
                  colour: T.steel,
                  tooltip: 'Add weight — ${machine.name}',
                  onTap: () => widget.onTally(run),
                ),
              if (widget.bearing != null)
                _SquareButton(
                  icon: Icons.thermostat_rounded,
                  colour: widget.bearing!.due ? T.warn : T.inkDim,
                  tooltip: '${widget.bearing!.bearingType} temperatures',
                  onTap: () => widget.onBearing(machine),
                ),
              if (!isDown)
                _SquareButton(
                  icon: Icons.build_outlined,
                  colour: T.inkDim,
                  tooltip: 'Report breakdown',
                  onTap: () => widget.onBreakdown(machine),
                ),
              const SizedBox(width: 4),
              StatePill(pill, tone: tone),
            ],
          ),

          const SizedBox(height: 10),

          if (isDown)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const StatePill('Breakdown', tone: PillTone.down),
                    const SizedBox(width: 6),
                    FormChip('since ${clock(down.downStart)}'),
                    const Spacer(),
                    Text(
                      down.downStart != null ? elapsed(down.downStart) : '--',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: T.err,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: 'Log repair',
                  expand: true,
                  variant: ButtonVariant.danger,
                  onPressed: () => widget.onRepair(down),
                ),
              ],
            )
          else if (run != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Wrap(
                        spacing: 5,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (run.batchNo != null) BatchRef(run.batchNo!),
                          if (run.formulation != null)
                            FormChip(run.formulation!),
                          // A press says what it is moulding. A sleeve or loop
                          // lot already leads with its batch number, which
                          // names the product - so repeating it would be the
                          // same word twice on a card read at a glance.
                          if (run.product != null && !isMoulding(run.kind))
                            FormChip(run.product!),
                          if (run.cureTempC != null)
                            FormChip('${run.cureTempC} °C'),
                          if (run.shiftDate.isNotEmpty && run.batchNo == null)
                            FormChip(dayMonth(run.shiftDate)),
                          if (run.quality != null) QualityChip(run.quality!),
                          if (run.mesh != null)
                            FormChip(run.mesh!, colour: T.steel),
                          if (run.outWeight != null)
                            FormChip(kgOf(run.outWeight)),
                          if (tally.isNotEmpty)
                            FormChip(
                              '${kgOf(tallied)} · ${tally.length} '
                              'load${tally.length > 1 ? 's' : ''}',
                              colour: T.steel,
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      elapsed(run.startedAt),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: paused ? T.warn : T.ok,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: paused ? '▶ Resume run' : '❚❚ Pause run',
                        onPressed: () => widget.onPause(run, !paused),
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label:
                          '${machine.kind == 'autoclave' ? 'Unload' : 'Stop'} ▸',
                      variant: ButtonVariant.primary,
                      onPressed: () => widget.onStop(run),
                    ),
                  ],
                ),
              ],
            )
          else
            InkWell(
              onTap: () => widget.onStart(machine),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _lastLine(machine, widget.last) ?? '',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: T.inkFaint,
                      ),
                    ),
                  ),
                  Text(
                    '${machine.kind == 'autoclave' ? 'Load' : 'Start'} ▸',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: accent,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// What this machine last did, on the idle line - and nothing at all on a
  /// sleeve or loop bench.
  ///
  /// The line leads on the batch number, which is right everywhere it is a
  /// batch: `last B1041 · Fine · 10:03 am` is a crew reading which lot came off
  /// here. A sleeve or loop number is the shift it was worked, so the same line
  /// renders `last 04/Aug/26-day · 10:03 am` - a date where a batch belongs,
  /// followed by a time, saying when twice and what never. The bench is one
  /// product per shift and the crew standing at it knows what it ran; the
  /// honest version of this line is the empty one.
  String? _lastLine(Machine machine, Run? last) {
    if (isMoulding(machine.kind)) return null;
    if (last == null) return 'no runs yet';
    return 'last ${last.batchNo ?? last.shift}'
        '${last.quality != null ? ' · ${last.quality}' : ''}'
        '${last.endedAt != null ? ' · ${clock(last.endedAt)}' : ''}';
  }
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({
    required this.icon,
    required this.colour,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final Color colour;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: T.line),
        ),
        child: Icon(icon, size: 15, color: colour),
      ),
    ),
  );
}

/// A machine may carry its own accent from the back office, either as a hex
/// value or as one of the CSS variable names the web client uses. An
/// unrecognised one falls back to the kind's colour rather than to nothing.
Color? _parseAccent(String raw) {
  final value = raw.trim();
  if (value.startsWith('#')) {
    final hex = value.substring(1);
    final full = hex.length == 6 ? 'FF$hex' : hex;
    final parsed = int.tryParse(full, radix: 16);
    if (parsed != null) return Color(parsed);
  }
  return null;
}
