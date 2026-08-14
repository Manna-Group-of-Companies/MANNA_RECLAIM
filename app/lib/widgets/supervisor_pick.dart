import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/ui_store.dart';
import 'fields.dart';

/// The name this record will be signed with, switchable.
///
/// Where the sheets used to print the signed-in account as a read-only line:
/// the same information, but the crew can correct it when the tablet is signed
/// in as someone other than whoever is on the floor. The pick is shared across
/// the sheets and remembered for the device, so it is switched once a shift.
///
/// A port of client/src/components/ui/SupervisorPick.tsx.
class SupervisorPick extends StatelessWidget {
  const SupervisorPick({
    super.key,
    this.label = 'Supervisor',
    this.note = '— signs this record',
    this.onChanged,
  });

  final String label;
  final String note;

  /// Fired after the name changes, so a sheet redrawing its own state can
  /// follow it.
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final ui = context.watch<UiStore>();
    return SelectFieldRow<String>(
      label: label,
      note: note,
      value: ui.supervisorName.isEmpty ? null : ui.supervisorName,
      items: [
        for (final option in ui.supervisorOptions)
          (value: option, label: option),
      ],
      hint: ui.supervisorIsAccount
          ? null
          : 'Switched from the account signed in on this tablet.',
      onChanged: (value) async {
        if (value == null) return;
        await ui.setSupervisor(value);
        onChanged?.call();
      },
    );
  }
}
