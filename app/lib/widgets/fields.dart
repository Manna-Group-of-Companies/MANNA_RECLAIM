/// The form controls the sheets are built from - a port of
/// client/src/components/ui/Field.tsx, plus the date and time pickers the web
/// version got free from `<input type="date">`.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/tokens.dart';
import '../core/utils/dates.dart';
import 'sheet.dart';
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
          Padding(padding: const EdgeInsets.only(top: 6), child: hintWidget!)
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

/// The same field, for a list too long to scroll.
///
/// [SelectFieldRow] is a dropdown, and a dropdown is the right control up to
/// about a screenful. The History tab's batch picker is not: the plant is at
/// 468 numbers and counting, and every one of them has to stay on the list -
/// the whole point of that picker is looking an old batch up. Scrolled, it is
/// unusable on a phone, and the number somebody wants is invariably the one
/// below the fold. Reading the first screen and concluding the list does not
/// have your batch is the correct reading of a dropdown that long.
///
/// So it reads as the same field and opens as a search: type 3079 and there it
/// is - and every number is still on the list for the crew reading down them
/// rather than looking one up. Everything else about it is deliberately
/// identical - the label, the chrome, the way the current choice is shown -
/// because it sits in a row beside three ordinary dropdowns and should not
/// look like a different kind of question.
class SearchSelectRow<V> extends StatelessWidget {
  const SearchSelectRow({
    super.key,
    required this.value,
    required this.items,
    required this.onChanged,
    this.label,
    this.note,
    this.hint,
    this.sheetTitle,
    this.searchLabel = 'Find',
    this.searchPlaceholder,
    this.placeholder,
  });

  final V? value;
  final List<({V value, String label})> items;
  final ValueChanged<V?> onChanged;
  final String? label;
  final String? note;
  final String? hint;

  /// What the picker calls itself. Falls back to the field's own label.
  final String? sheetTitle;
  final String searchLabel;
  final String? searchPlaceholder;

  /// Shown when nothing is selected and no item matches the current value.
  final String? placeholder;

  String get _currentLabel {
    for (final item in items) {
      if (item.value == value) return item.label;
    }
    return placeholder ?? '';
  }

  @override
  Widget build(BuildContext context) => _FieldShell(
    label: label,
    note: note,
    hint: hint,
    child: InkWell(
      onTap: () => unawaited(_pick(context)),
      borderRadius: BorderRadius.circular(T.radiusSm),
      child: InputDecorator(
        decoration: const InputDecoration(),
        child: Row(
          children: [
            Expanded(
              child: Text(
                _currentLabel,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, color: T.ink),
              ),
            ),
            const Icon(Icons.search, size: 18, color: T.inkFaint),
          ],
        ),
      ),
    ),
  );

  Future<void> _pick(BuildContext context) async {
    final search = TextEditingController();
    var query = '';

    /*
     * The answer comes back as a position rather than as the value itself. A
     * picker whose values include '' - which this one's does, because "All
     * batches" is an option and not the absence of one - cannot tell a chosen
     * value from a sheet that was swiped away if it pops the value.
     */
    final chosen = await showAppSheet<int>(
      context: context,
      title: sheetTitle ?? label ?? 'Choose',
      body: (sheetContext, setSheetState) {
        final needle = query.trim().toLowerCase();
        final matches = needle.isEmpty
            ? items
            : items
                  .where(
                    (i) =>
                        i.label.toLowerCase().contains(needle) ||
                        '${i.value}'.toLowerCase().contains(needle),
                  )
                  .toList(growable: false);
        final media = MediaQuery.of(sheetContext);

        /*
         * Every match, however many that is.
         *
         * This used to draw the first sixty and say so, on the reasoning that
         * past that many the answer is to type another character. It is not:
         * the crew opens this picker to read down the numbers as often as to
         * look one up - "which batch was the one before this" is a question
         * with no character to type - and a list that stops at sixty of four
         * hundred and sixty-eight cannot answer it.
         *
         * Lazily, because the whole list is now on offer. A builder inside a
         * bounded box asks only for the rows the box can show, so the picker
         * costs a screenful whether the plant is at four hundred batches or
         * four thousand. The height is measured off the screen less whatever
         * the keyboard is covering, so the list ends above the number pad
         * rather than behind it.
         */
        final room = ((media.size.height - media.viewInsets.bottom) * 0.55)
            .clamp(200.0, media.size.height);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFieldRow(
              controller: search,
              label: searchLabel,
              placeholder: searchPlaceholder,
              autofocus: true,
              onChanged: (v) => setSheetState(() => query = v),
            ),
            if (matches.isEmpty)
              Hint('Nothing matches “${query.trim()}”.')
            else
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: room),
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: matches.length,
                  itemBuilder: (context, i) {
                    final item = matches[i];
                    return _PickerOption(
                      label: item.label,
                      selected: item.value == value,
                      onTap: () =>
                          Navigator.of(sheetContext).pop(items.indexOf(item)),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );

    search.dispose();
    if (chosen != null && chosen >= 0 && chosen < items.length) {
      onChanged(items[chosen].value);
    }
  }
}

/// One row of [SearchSelectRow]'s list. A full-width tap target rather than a
/// menu entry: it is being tapped in gloves, off a phone held in one hand.
class _PickerOption extends StatelessWidget {
  const _PickerOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(T.radiusSm),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: selected ? T.tBrandBg : T.sunken,
        border: Border.all(color: selected ? T.tBrandLine : T.line),
        borderRadius: BorderRadius.circular(T.radiusSm),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                color: selected ? T.brandSoft : T.ink,
              ),
            ),
          ),
          if (selected)
            const Icon(Icons.check_rounded, size: 18, color: T.brandSoft),
        ],
      ),
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
///
/// Always side by side, at every width: these are the pairs somebody decided
/// belong together - a date and its shift, a start meter and an end one - and
/// they were drawn to fit a phone that way.
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

/// Fields that pair up only when there is room, and stack when there is not.
///
/// Where [FieldRow] is a pair somebody chose, this is a run of fields that are
/// simply alike - the four temperatures off a machine's bearings, the pickers
/// above the run log - and that read as a list on a phone and as a block on a
/// tablet. A sheet on the M11 is 640 wide, which is two fields and the gap
/// between them; the same sheet on a handset is one, and nothing about the
/// phone layout changes.
///
/// It is [CardGrid]'s arithmetic with a field's minimum width rather than a
/// card's, and never more than two across - a form read in three columns is a
/// form somebody fills in in the wrong order.
class FieldColumns extends StatelessWidget {
  const FieldColumns({
    super.key,
    required this.children,
    this.minFieldWidth = 260,
  });

  final List<Widget> children;

  /// The narrowest a field is still worth typing into. A row of pickers asks
  /// for more than a temperature box does, so the callers that hold wider
  /// controls say so.
  final double minFieldWidth;

  @override
  Widget build(BuildContext context) =>
      CardGrid(minTileWidth: minFieldWidth, maxColumns: 2, children: children);
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
