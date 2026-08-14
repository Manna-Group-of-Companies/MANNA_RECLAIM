/// Which sheet a machine gets, and what it is asked for.
///
/// These are the predicates MachinesPage.tsx spells out at the top of the file,
/// lifted here so the start sheet, the stop sheet and the card all read the
/// same rules. Every one of them is about how the plant actually works rather
/// than about a data shape, which is why each carries its reason.
library;

import '../../core/config/constants.dart';
import '../../core/models/models.dart';

/// The refiner line - pre-refiners included, as REFINER_IDS has them. These are
/// the machines whose electricity and hour meters the crew reads off the
/// machine at the start of a run, so their start sheet asks for the whole shift
/// context rather than assuming today's date and the clock's shift.
bool isRefiner(Machine m) => m.kind == 'refiner' || m.kind == 'prerefiner';

/// The grinding and coarse lines run by the shift rather than by the batch: a
/// machine is started for a shift, and what comes off it is weighed afterwards.
bool isShiftwiseKind(String? kind) => kind == 'grind' || kind == 'coarse';

/// PR1 and Refiner 2 live on the coarse line, but either can be turned onto the
/// special line to refine a batch instead. Which one it is running decides the
/// whole sheet - a shift and its meters, or a batch and its meters - so they
/// ask before anything else rather than assuming the coarse line every time.
bool isDualLine(Machine m) => m.kind == 'coarse';

/// The same question asked of a run already on record. A run carries the line
/// it was started on, so a coarse-line machine's special pass reads back as one.
bool lineIsShiftwise(String? line) => line == 'grind' || line == 'coarse';

/// A moulding press. It moulds finished goods out of reclaim compound rather
/// than making reclaim, so it shares almost nothing with the rest of the plant:
/// no meters, no energy, no run hours, no bearings, nothing for the Weigh tab
/// and no packing path. What it records is a count of pieces against a product.
bool isPressKind(String? kind) => kind == 'press';

/// Every machine but the autoclaves, the presses and the two moulding
/// activities is metered, so its sheets ask for the two readings either side of
/// the run. The autoclaves burn firewood and are timed by their load; a press,
/// a sleeve bench and a loop bench record neither energy nor hours at all.
bool hasMeters(String? kind) =>
    kind != null &&
    kind.isNotEmpty &&
    kind != 'autoclave' &&
    kind != 'press' &&
    !isMoulding(kind);

/// Why Soorya's readings are not kWh, on both of its sheets.
const todNote =
    'Soorya has no direct energy meter — this is the TOD meter (one phase); '
    'energy is recorded as the difference × 3.';
