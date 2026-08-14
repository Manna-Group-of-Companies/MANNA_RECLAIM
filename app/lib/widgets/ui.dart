/// The shared widgets, ported from client/src/components/ui.
///
/// Same shapes, same words, same rules about when a control is drawn dead
/// rather than hidden - see the note on [AppButton]. Nothing here sets a raw
/// colour: every value comes off [T].
library;

import 'package:flutter/material.dart';

import '../core/config/constants.dart';
import '../core/theme/layout.dart';
import '../core/theme/tokens.dart';

// --------------------------------------------------------------- chips -----

enum PillTone { neutral, run, paused, down, shift, ok, warn }

/// The state pill on a machine card and anywhere else a run has a status.
///
/// Named apart from Material's own `Badge`, which is a different thing - a dot
/// on a tab - and which this app also uses.
class StatePill extends StatelessWidget {
  const StatePill(this.label, {super.key, this.tone = PillTone.neutral});

  final String label;
  final PillTone tone;

  ({Color fg, Color bg}) get _colours => switch (tone) {
    PillTone.run => (fg: T.ok, bg: T.tOkBg),
    PillTone.paused => (fg: T.warn, bg: T.tWarnBg),
    PillTone.down => (fg: T.err, bg: T.tErrBg),
    PillTone.shift => (fg: T.steel, bg: T.sunken),
    PillTone.ok => (fg: T.ok, bg: T.tOkBg),
    PillTone.warn => (fg: T.warn, bg: T.tWarnBg),
    PillTone.neutral => (fg: T.inkDim, bg: T.sunken),
  };

  @override
  Widget build(BuildContext context) {
    final c = _colours;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.fg.withValues(alpha: 0.32)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: c.fg,
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

/// Colour-coded grade chip. The five refiner qualities plus Coarse and
/// Sillsheet, which only ever appear on a dispatch line - and a product name,
/// which has no colour of its own and falls through to the neutral fill.
class QualityChip extends StatelessWidget {
  const QualityChip(this.quality, {super.key});
  final String quality;

  @override
  Widget build(BuildContext context) {
    final colour = qualityColour[quality];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: colour ?? T.panel2,
        borderRadius: BorderRadius.circular(999),
        border: colour == null ? Border.all(color: T.line2) : null,
      ),
      child: Text(
        quality,
        style: TextStyle(
          color: colour == null ? T.inkDim : T.onFill,
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// Monospaced batch number, the anchor of every card in the prototype.
class BatchRef extends StatelessWidget {
  const BatchRef(this.text, {super.key, this.size = 12.5});
  final String text;
  final double size;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      fontFamily: 'monospace',
      fontFeatures: const [FontFeature.tabularFigures()],
      fontSize: size,
      fontWeight: FontWeight.w700,
      color: T.ink,
    ),
  );
}

/// Outlined secondary chip: formulation, mesh, shift date, machine short code.
class FormChip extends StatelessWidget {
  const FormChip(this.text, {super.key, this.colour});
  final String text;
  final Color? colour;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: T.line2),
    ),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w600,
        color: colour ?? T.inkDim,
      ),
    ),
  );
}

// ------------------------------------------------------------- buttons -----

enum ButtonVariant { primary, ghost, elec, danger }

/// The app's one button.
///
/// It keeps the rule the web screens follow throughout: a control that cannot
/// be used is drawn dead with the reason beside it rather than hidden. A button
/// that is not there is a question - is this screen broken, am I the wrong
/// account, has the stock not arrived - and answering it costs a walk to the
/// office.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = ButtonVariant.ghost,
    this.loading = false,
    this.dense = false,
    this.expand = false,
    this.tooltip,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final bool loading;
  final bool dense;
  final bool expand;

  /// Why the button will not move, when it will not. Shown on long-press,
  /// because a tablet has no hover and a disabled button is not focusable.
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    final (fg, bg, border) = switch (variant) {
      ButtonVariant.primary => (T.onFill, T.brand, T.brand),
      ButtonVariant.elec => (T.onFill, T.elec, T.elec),
      ButtonVariant.danger => (T.err, T.tErrBg, T.tErrLine),
      ButtonVariant.ghost => (T.ink, T.panel2, T.line2),
    };

    final child = Container(
      alignment: Alignment.center,
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 10 : 14,
        vertical: dense ? 7 : 11,
      ),
      decoration: BoxDecoration(
        color: enabled ? bg : bg.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(T.radiusSm),
        border: Border.all(
          color: enabled ? border : border.withValues(alpha: 0.4),
        ),
      ),
      child: loading
          ? SizedBox(
              height: 15,
              width: 15,
              child: CircularProgressIndicator(strokeWidth: 2, color: fg),
            )
          : Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: enabled ? fg : fg.withValues(alpha: 0.45),
                fontSize: dense ? 11.5 : 13,
                fontWeight: FontWeight.w700,
              ),
            ),
    );

    final button = InkWell(
      onTap: enabled ? onPressed : null,
      borderRadius: BorderRadius.circular(T.radiusSm),
      child: child,
    );

    final wrapped = tooltip == null
        ? button
        : Tooltip(
            message: tooltip!,
            triggerMode: TooltipTriggerMode.longPress,
            child: button,
          );

    return expand ? SizedBox(width: double.infinity, child: wrapped) : wrapped;
  }
}

// -------------------------------------------------------------- panels -----

/// The panel every card and section sits on.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.accent,
    this.active = false,
    this.margin,
  });

  final Widget child;
  final EdgeInsets padding;

  /// The 4px rail down the left of a machine or batch card.
  final Color? accent;
  final bool active;
  final EdgeInsets? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: T.panel,
        borderRadius: BorderRadius.circular(T.radius),
        border: Border.all(
          color: active ? T.brand.withValues(alpha: 0.5) : T.line,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: accent == null
          ? Padding(padding: padding, child: child)
          // The rail is painted behind the content rather than laid out beside
          // it. A Row with a stretched cross axis would ask for the panel's
          // full height, and inside a ListView that height is unbounded - so
          // every accented card on every list threw "BoxConstraints forces an
          // infinite height" and rendered as nothing. The Stack sizes itself to
          // the padded content, which is the height the rail should be, and the
          // positioned strip fills it.
          : Stack(
              children: [
                Padding(
                  padding: padding.copyWith(left: padding.left + 4),
                  child: child,
                ),
                PositionedDirectional(
                  start: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  child: ColoredBox(
                    color: accent!.withValues(alpha: active ? 1 : 0.5),
                  ),
                ),
              ],
            ),
    );
  }
}

/// Lays a list of cards out in as many columns as the space will take.
///
/// One card per row on a phone, which is the shape every card in this app was
/// drawn for and the shape it keeps. On a tablet the same cards go two or three
/// across: the alternative is a card stretched to the width of a landscape
/// screen, which does not say any more than it did - it just puts a foot of
/// whitespace between the batch number and the button that acts on it, and
/// halves how much of the queue is on screen at once.
///
/// Cards carry their own bottom margin, so the rows are spaced by the cards
/// themselves and this only has to supply the gap between columns.
///
/// [minTileWidth] is the narrowest that card is still worth reading at - a
/// batch card carrying a four-column grade grid needs more of it than a weigh
/// row does, so the pages that hold wider cards say so.
class CardGrid extends StatelessWidget {
  const CardGrid({
    super.key,
    required this.children,
    this.minTileWidth = 320,
    this.maxColumns = 3,
  });

  final List<Widget> children;
  final double minTileWidth;
  final int maxColumns;

  static const _gap = 10.0;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(
      builder: (context, box) {
        final columns = columnsFor(
          box.maxWidth,
          minTile: minTileWidth,
          gap: _gap,
          limit: maxColumns,
        );

        // The single-column case is left as a plain column rather than a
        // one-wide Wrap: it is what a phone gets, and it should lay out exactly
        // as it did before this widget existed.
        if (columns == 1) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          );
        }

        final width = (box.maxWidth - _gap * (columns - 1)) / columns;
        return Wrap(
          spacing: _gap,
          children: [
            for (final child in children) SizedBox(width: width, child: child),
          ],
        );
      },
    );
  }
}

/// Holds its child to a comfortable reading width and centres it.
///
/// For the pages that are read rather than worked - Settings, the diagnostic
/// log, the login card. A form field stretched across a landscape tablet is a
/// label at one end and its value at the other.
class ReadableColumn extends StatelessWidget {
  const ReadableColumn({super.key, required this.child, this.maxWidth});

  final Widget child;
  final double? maxWidth;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth ?? readableWidth),
      child: child,
    ),
  );
}

/// `.view-head`: the tab title on the left, a live count on the right.
class ViewHead extends StatelessWidget {
  const ViewHead({super.key, required this.title, this.meta});
  final String title;
  final Widget? meta;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12, top: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(width: 12),
        if (meta != null)
          Expanded(
            child: DefaultTextStyle(
              style: const TextStyle(fontSize: 11.5, color: T.inkFaint),
              textAlign: TextAlign.right,
              child: meta!,
            ),
          ),
      ],
    ),
  );
}

/// Uppercase divider inside a sheet.
class SheetLabel extends StatelessWidget {
  const SheetLabel(this.text, {super.key, this.note});
  final String text;

  /// Small grey aside on the label line.
  final String? note;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
            color: T.inkFaint,
          ),
        ),
        if (note != null) ...[
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              note!,
              style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
            ),
          ),
        ],
      ],
    ),
  );
}

/// The section heading on a list page: a title, a rule, and a count.
class SectionHead extends StatelessWidget {
  const SectionHead(this.title, {super.key, this.count});
  final String title;
  final String? count;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 8),
    child: Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: T.ink,
          ),
        ),
        const SizedBox(width: 10),
        const Expanded(child: Divider(color: T.rule, height: 1)),
        if (count != null) ...[
          const SizedBox(width: 10),
          Text(count!, style: const TextStyle(fontSize: 11, color: T.inkFaint)),
        ],
      ],
    ),
  );
}

/// Read-only key / value strip used to show a computed total inside a sheet.
class Readout extends StatelessWidget {
  const Readout({
    super.key,
    required this.label,
    required this.value,
    this.valueColour,
    this.labelWidget,
  });

  final String label;
  final String value;
  final Color? valueColour;
  final Widget? labelWidget;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: T.sunken,
      borderRadius: BorderRadius.circular(T.radiusSm),
      border: Border.all(color: T.line),
    ),
    child: Row(
      children: [
        Expanded(
          child:
              labelWidget ??
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: T.inkFaint),
              ),
        ),
        const SizedBox(width: 10),
        Text(
          value,
          textAlign: TextAlign.right,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: valueColour ?? T.ink,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    ),
  );
}

/// The tinted box a sheet shows its arithmetic in before it is committed - a
/// meter difference, a material cost, a piece-count variance.
class DiffOut extends StatelessWidget {
  const DiffOut(this.text, {super.key, this.bad = false});
  final String text;
  final bool bad;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
    decoration: BoxDecoration(
      color: bad ? T.tErrBg : T.tElecBg,
      borderRadius: BorderRadius.circular(T.radiusSm),
      border: Border.all(color: bad ? T.tErrLine : T.tElecLine),
    ),
    child: Text(
      text,
      style: TextStyle(fontSize: 12, color: bad ? T.err : T.elec, height: 1.4),
    ),
  );
}

/// A quiet line of guidance under a field or a card.
class Hint extends StatelessWidget {
  const Hint(this.text, {super.key, this.colour});
  final String text;
  final Color? colour;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 11.5,
        height: 1.45,
        color: colour ?? T.inkFaint,
      ),
    ),
  );
}

/// Red inline validation block above the sheet actions.
class FormWarning extends StatelessWidget {
  const FormWarning(this.messages, {super.key});
  final List<String> messages;

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: T.tErrBg,
        borderRadius: BorderRadius.circular(T.radiusSm),
        border: Border.all(color: T.tErrLine),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final m in messages)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 1),
              child: Text(
                m,
                style: const TextStyle(
                  fontSize: 12,
                  color: T.err,
                  height: 1.35,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The 2-up KPI tile from the Reports tab.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.unit,
  });

  final String label;
  final String value;
  final String? unit;

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Flexible(
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: T.ink,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ),
            if (unit != null) ...[
              const SizedBox(width: 4),
              Text(
                unit!,
                style: const TextStyle(fontSize: 11, color: T.inkFaint),
              ),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            letterSpacing: 0.9,
            fontWeight: FontWeight.w700,
            color: T.inkFaint,
          ),
        ),
      ],
    ),
  );
}

/// One line of what is missing, and one line of how to make it appear.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.hint,
    this.icon,
    this.action,
  });

  final String title;
  final String? hint;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 34, color: T.line2),
          const SizedBox(height: 12),
        ],
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: T.inkDim,
          ),
        ),
        if (hint != null) ...[
          const SizedBox(height: 8),
          Text(
            hint!,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12,
              height: 1.5,
              color: T.inkFaint,
            ),
          ),
        ],
        if (action != null) ...[const SizedBox(height: 16), action!],
      ],
    ),
  );
}

class PageLoader extends StatelessWidget {
  const PageLoader({super.key, this.label = 'Loading'});
  final String label;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(strokeWidth: 2.2),
        ),
        const SizedBox(height: 14),
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 10.5,
            letterSpacing: 2,
            color: T.inkFaint,
          ),
        ),
      ],
    ),
  );
}

// --------------------------------------------------------------- picks -----

/// Grid of large tap targets - the sheets pick a quality, a capacity, a batch
/// or a product with it. Sized for a gloved thumb, which is what the whole
/// pick-rather-than-type pattern on these sheets exists for.
///
/// Two across on a phone whatever happens: a tap target that is half a screen
/// wide is not easier to hit than one a quarter of a screen wide, and the pick
/// list is shorter to scan in two columns. Wider sheets take a third and then a
/// fourth column instead of growing the targets, so a batch picker on a tablet
/// is one screen rather than three.
class PickGrid extends StatelessWidget {
  const PickGrid({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final columns = box.maxWidth > 700
          ? 4
          : box.maxWidth > 460
          ? 3
          : 2;
      const gap = 8.0;
      final width = (box.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (final child in children) SizedBox(width: width, child: child),
        ],
      );
    },
  );
}

class Pick extends StatelessWidget {
  const Pick({
    super.key,
    required this.title,
    required this.onTap,
    this.sub,
    this.subWidget,
    this.selected = false,
    this.dot,
    this.mono = false,
  });

  final String title;
  final VoidCallback onTap;
  final String? sub;
  final Widget? subWidget;
  final bool selected;

  /// A colour swatch before the title, the same one the grade wears on its
  /// chip - the crews pick a grade by its colour before they read its name.
  final Color? dot;

  /// Renders the title in mono, for autoclave capacities and batch numbers.
  final bool mono;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(T.radiusSm),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 11),
      decoration: BoxDecoration(
        color: selected ? T.tBrandBg : T.sunken,
        borderRadius: BorderRadius.circular(T.radiusSm),
        border: Border.all(color: selected ? T.brand : T.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (dot != null) ...[
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
                ),
                const SizedBox(width: 7),
              ],
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: mono ? 16 : 13,
                    fontFamily: mono ? 'monospace' : null,
                    fontWeight: FontWeight.w700,
                    color: selected ? T.brandSoft : T.ink,
                  ),
                ),
              ),
            ],
          ),
          if (subWidget != null) ...[
            const SizedBox(height: 5),
            subWidget!,
          ] else if (sub != null && sub!.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              sub!,
              maxLines: 2,
              style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
            ),
          ],
        ],
      ),
    ),
  );
}

/// The filter row above a list: All, then one chip per grade or product with a
/// count on it. Offering one with nothing under it is a dead option on a
/// tablet - it is picked once, shows an empty list, and is never trusted again
/// - so callers only pass what is actually waiting.
class FilterChips extends StatelessWidget {
  const FilterChips({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelect,
    required this.allCount,
    this.allLabel = 'All',
  });

  final List<({String value, String label, int count, Color? colour})> options;
  final String selected;
  final ValueChanged<String> onSelect;
  final int allCount;
  final String allLabel;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        _chip(allLabel, allCount, selected.isEmpty, null, () => onSelect('')),
        for (final o in options) ...[
          const SizedBox(width: 6),
          _chip(
            o.label,
            o.count,
            selected == o.value,
            o.colour,
            () => onSelect(o.value),
          ),
        ],
      ],
    ),
  );

  Widget _chip(
    String label,
    int count,
    bool on,
    Color? colour,
    VoidCallback onTap,
  ) {
    final fill = colour ?? T.brand;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: on ? fill : T.sunken,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: on ? fill : T.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: on ? T.onFill : T.inkDim,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              '$count',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: on ? T.onFill.withValues(alpha: 0.7) : T.inkFaint,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A horizontal band of quantities - the yard's "how much is standing here".
class TallyStrip extends StatelessWidget {
  const TallyStrip({super.key, required this.cells});
  final List<({Widget badge, String line, bool nil})> cells;

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    margin: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final cell in cells)
          Opacity(
            opacity: cell.nil ? 0.45 : 1,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  cell.badge,
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      cell.line,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: T.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
