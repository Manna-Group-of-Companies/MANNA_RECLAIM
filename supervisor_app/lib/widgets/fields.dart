/// The form controls the sheets are built from - a port of
/// client/src/components/ui/Field.tsx, plus the date and time pickers the web
/// version got free from `<input type="date">`.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/tokens.dart';
import '../core/utils/dates.dart';
import 'ui.dart';

/// The label line above a field: what it is, and a small grey aside - "opt.",
/// "blank = now", "— last end 41820".
class _FieldShell extends StatelessWidget {
  const _FieldShell({
    required this.child,
    this.label,
    this.note,
    this.hint,
    this.hintWidget,
  });

  final Widget child;
  final String? label;
  final String? note;
  final String? hint;
  final Widget? hintWidget;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  label!.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: FontWeight.w800,
                    color: T.inkFaint,
                  ),
                ),
                if (note != null)
                  Text(
                    ' $note',
                    style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
                  ),
              ],
            ),
          ),
        child,
        if (hintWidget != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: hintWidget!,
          )
        else if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              hint!,
              style: const TextStyle(
                fontSize: 11,
                height: 1.4,
                color: T.inkFaint,
              ),
            ),
          ),
      ],
    ),
  );
}

/// A text or number field. `suffix` is the unit printed inside the box on the
/// right - kg, °C, kWh, units, hrs - which is how these sheets keep a bare
/// number from meaning two things.
class TextFieldRow extends StatelessWidget {
  const TextFieldRow({
    super.key,
    required this.controller,
    this.label,
    this.note,
    this.hint,
    this.hintWidget,
    this.suffix,
    this.placeholder,
    this.keyboardType,
    this.decimal = false,
    this.integer = false,
    this.upperCase = false,
    this.enabled = true,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.obscure = false,
    this.maxLength,
  });

  final TextEditingController controller;
  final String? label;
  final String? note;
  final String? hint;
  final Widget? hintWidget;
  final String? suffix;
  final String? placeholder;
  final TextInputType? keyboardType;

  /// Digits and one dot. What every weight, meter reading and rate takes.
  final bool decimal;

  /// Digits only. What every count takes - sacks, pieces, labourers.
  final bool integer;
  final bool upperCase;
  final bool enabled;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final bool obscure;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    final formatters = <TextInputFormatter>[
      if (integer) FilteringTextInputFormatter.digitsOnly,
      if (decimal && !integer)
        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
      if (upperCase) _UpperCaseFormatter(),
      if (maxLength != null) LengthLimitingTextInputFormatter(maxLength),
    ];

    return _FieldShell(
      label: label,
      note: note,
      hint: hint,
      hintWidget: hintWidget,
      child: TextField(
        controller: controller,
        enabled: enabled,
        autofocus: autofocus,
        obscureText: obscure,
        maxLines: obscure ? 1 : maxLines,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textInputAction: maxLines > 1
            ? TextInputAction.newline
            : TextInputAction.done,
        keyboardType:
            keyboardType ??
            (integer
                ? TextInputType.number
                : decimal
                ? const TextInputType.numberWithOptions(decimal: true)
                : maxLines > 1
                ? TextInputType.multiline
                : TextInputType.text),
        inputFormatters: formatters.isEmpty ? null : formatters,
        style: TextStyle(
          fontSize: 14,
          color: enabled ? T.ink : T.inkFaint,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
        decoration: InputDecoration(
          hintText: placeholder,
          suffixText: suffix,
          suffixStyle: const TextStyle(color: T.inkFaint, fontSize: 12),
        ),
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) => newValue.copyWith(text: newValue.text.toUpperCase());
}

/// A pick-one field. Rendered as a dropdown rather than the web's `<select>`
/// for the same reason: it is a list too long or too dull for a pick grid.
class SelectFieldRow<V> extends StatelessWidget {
  const SelectFieldRow({
    super.key,
    required this.value,
    required this.items,
    required this.onChanged,
    this.label,
    this.note,
    this.hint,
    this.placeholder,
  });

  final V? value;
  final List<({V value, String label})> items;
  final ValueChanged<V?> onChanged;
  final String? label;
  final String? note;
  final String? hint;

  /// The "pick one…" row at the top, for a field with no sensible default.
  final String? placeholder;

  @override
  Widget build(BuildContext context) => _FieldShell(
    label: label,
    note: note,
    hint: hint,
    child: DropdownButtonFormField<V>(
      initialValue: value,
      isExpanded: true,
      dropdownColor: T.panel2,
      icon: const Icon(Icons.expand_more, size: 20, color: T.inkFaint),
      style: const TextStyle(fontSize: 14, color: T.ink),
      hint: placeholder == null
          ? null
          : Text(
              placeholder!,
              style: const TextStyle(fontSize: 13.5, color: T.inkFaint),
            ),
      items: [
        for (final item in items)
          DropdownMenuItem<V>(
            value: item.value,
            child: Text(item.label, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: onChanged,
    ),
  );
}

/// A 'YYYY-MM-DD' field. Held as the plain string the API takes, so nothing has
/// to be converted on the way out and a night shift keeps its own date.
class DateFieldRow extends StatelessWidget {
  const DateFieldRow({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.note,
    this.hint,
    this.placeholder = 'pick a date',
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? label;
  final String? note;
  final String? hint;
  final String placeholder;

  @override
  Widget build(BuildContext context) => _FieldShell(
    label: label,
    note: note,
    hint: hint,
    child: InkWell(
      onTap: () async {
        final now = DateTime.now();
        final current = DateTime.tryParse(value.isEmpty ? '' : value) ?? now;
        final picked = await showDatePicker(
          context: context,
          initialDate: current,
          firstDate: DateTime(now.year - 3),
          lastDate: DateTime(now.year + 1),
        );
        if (picked != null) onChanged(todayISO(picked));
      },
      borderRadius: BorderRadius.circular(T.radiusSm),
      child: _Well(
        child: Row(
          children: [
            Expanded(
              child: Text(
                value.isEmpty ? placeholder : dayLong(value),
                style: TextStyle(
                  fontSize: 14,
                  color: value.isEmpty ? T.inkFaint : T.ink,
                ),
              ),
            ),
            const Icon(Icons.calendar_today, size: 16, color: T.inkFaint),
          ],
        ),
      ),
    ),
  );
}

/// An 'HH:MM' field. Blank is a real answer on every sheet that takes one - it
/// means "now" - so the field says so and clears back to it.
class TimeFieldRow extends StatelessWidget {
  const TimeFieldRow({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.note,
    this.hint,
    this.placeholder = 'now',
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? label;
  final String? note;
  final String? hint;
  final String placeholder;

  @override
  Widget build(BuildContext context) => _FieldShell(
    label: label,
    note: note,
    hint: hint,
    child: Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: () async {
              final parts = value.split(':');
              final picked = await showTimePicker(
                context: context,
                initialTime: parts.length == 2
                    ? TimeOfDay(
                        hour: int.tryParse(parts[0]) ?? 0,
                        minute: int.tryParse(parts[1]) ?? 0,
                      )
                    : TimeOfDay.now(),
              );
              if (picked != null) {
                onChanged(
                  '${picked.hour.toString().padLeft(2, '0')}:'
                  '${picked.minute.toString().padLeft(2, '0')}',
                );
              }
            },
            borderRadius: BorderRadius.circular(T.radiusSm),
            child: _Well(
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      value.isEmpty ? placeholder : value,
                      style: TextStyle(
                        fontSize: 14,
                        color: value.isEmpty ? T.inkFaint : T.ink,
                      ),
                    ),
                  ),
                  const Icon(Icons.schedule, size: 16, color: T.inkFaint),
                ],
              ),
            ),
          ),
        ),
        if (value.isNotEmpty) ...[
          const SizedBox(width: 8),
          IconButton(
            onPressed: () => onChanged(''),
            icon: const Icon(Icons.close, size: 18),
            tooltip: 'Back to now',
            color: T.inkFaint,
          ),
        ],
      ],
    ),
  );
}

class _Well extends StatelessWidget {
  const _Well({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
    decoration: BoxDecoration(
      color: T.sunken,
      borderRadius: BorderRadius.circular(T.radiusSm),
      border: Border.all(color: T.line),
    ),
    child: child,
  );
}

/// Two fields side by side, as `.field-inline` in the web client.
class FieldRow extends StatelessWidget {
  const FieldRow({super.key, required this.left, required this.right});
  final Widget left;
  final Widget right;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(child: left),
      const SizedBox(width: 10),
      Expanded(child: right),
    ],
  );
}

/// A boolean drawn as two picks rather than a switch, because these sheets are
/// worked with gloves on and both answers deserve to be readable.
class TwoWayPick extends StatelessWidget {
  const TwoWayPick({
    super.key,
    required this.value,
    required this.onChanged,
    required this.onTitle,
    required this.offTitle,
    this.onSub,
    this.offSub,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final String onTitle;
  final String offTitle;
  final String? onSub;
  final String? offSub;

  @override
  Widget build(BuildContext context) => PickGrid(
    children: [
      Pick(
        title: onTitle,
        sub: onSub,
        selected: value,
        onTap: () => onChanged(true),
      ),
      Pick(
        title: offTitle,
        sub: offSub,
        selected: !value,
        onTap: () => onChanged(false),
      ),
    ],
  );
}
