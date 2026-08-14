/// The rules that had to survive the port, pinned.
///
/// Each of these is a place where getting it slightly wrong is invisible on
/// screen and wrong in the plant's record: a shift boundary off by a minute, a
/// lot number that reads as yesterday west of Greenwich, a variance that
/// flatters a mould running short.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/config/constants.dart';
import 'package:manna_supervisor/core/utils/dates.dart';
import 'package:manna_supervisor/core/utils/moulding_batch.dart';

void main() {
  group('shifts', () {
    test('day is 08:30 to 20:30, night is everything else', () {
      // The same rule the server applies, so a run started at 20:31 belongs to
      // the same shift on both sides.
      expect(shiftForMinutes(8 * 60 + 29), 'Night');
      expect(shiftForMinutes(8 * 60 + 30), 'Day');
      expect(shiftForMinutes(20 * 60 + 29), 'Day');
      expect(shiftForMinutes(20 * 60 + 30), 'Night');
    });

    test('a blank time means now, not midnight', () {
      expect(shiftForTime(''), currentShift());
      expect(shiftForTime(null), currentShift());
      expect(shiftForTime('21:00'), 'Night');
      expect(shiftForTime('09:00'), 'Day');
    });
  });

  group('dates read as plant-local, never UTC', () {
    test('a bare YYYY-MM-DD is not shifted a day west of Greenwich', () {
      // DateTime.parse would read this as UTC midnight and show the 2nd.
      expect(dayMonth('2026-08-03'), '03 Aug');
      expect(dayLong('2026-07-07'), '7 Jul 2026');
    });

    test('a coarse number carries the month it was charged in', () {
      expect(monthLetter('2026-03-01'), 'C');
      expect(monthShort('2026-03-01'), 'Mar');
      // A wrong letter is worse than none, because the crew would leave it
      // standing.
      expect(monthLetter(''), '');
      expect(monthLetter('not a date'), '');
    });
  });

  group('the lot a sleeve or loop run is filed under', () {
    test('is the shift, and the product is not in it', () {
      expect(
        mouldingBatchNo(shiftDate: '2026-08-03', shift: 'Day'),
        '03/Aug/26-day',
      );
      expect(
        mouldingBatchNo(shiftDate: '2026-08-03', shift: 'Night'),
        '03/Aug/26-night',
      );
    });

    test('is empty when either half is missing, which the sheet shows', () {
      expect(mouldingBatchNo(shiftDate: '', shift: 'Day'), '');
      expect(mouldingBatchNo(shiftDate: '2026-08-03', shift: ''), '');
    });
  });

  group('what the cycle and the mould said a run should have made', () {
    test('counts whole cycles only', () {
      // A run stopped two thirds of the way through a cycle has an unfinished
      // piece in the mould, not two thirds of one.
      expect(
        expectedPieces(runtimeMin: 100, cyclicMin: 30, cavities: 4),
        12,
      );
      expect(expectedPieces(runtimeMin: 29, cyclicMin: 30, cavities: 4), 0);
    });

    test('is null when the product has not been measured in', () {
      expect(expectedPieces(runtimeMin: 100, cyclicMin: null, cavities: 4),
          isNull);
      expect(expectedPieces(runtimeMin: 100, cyclicMin: 30, cavities: null),
          isNull);
    });

    test('a lot that came up short reads negative', () {
      expect(variancePct(90, 100), -10);
      expect(variancePct(110, 100), 10);
      expect(variancePct(100, 100), 0);
      expect(variancePct(90, null), isNull);
    });

    test('only a wide gap is flagged', () {
      expect(overVariance(piecesVariancePct.toDouble()), isFalse);
      expect(overVariance(piecesVariancePct + 0.1), isTrue);
      expect(overVariance(-(piecesVariancePct + 0.1)), isTrue);
      expect(overVariance(null), isFalse);
    });
  });

  group('who may do what', () {
    test('clearing a record is narrower than the back office', () {
      // A manager keeps every write they can take back by doing it again; this
      // is the half no screen puts back.
      expect(deleteRoles, [Roles.admin]);
      expect(deleteRoles.contains(Roles.manager), isFalse);
    });

    test('the yard raises its own dispatches', () {
      expect(dispatchRoles.contains(Roles.supervisor), isTrue);
      expect(dispatchRoles.contains(Roles.worker), isFalse);
      expect(dispatchRoles.contains(Roles.lab), isFalse);
    });

    test('the lab has no place in this app', () {
      expect(floorRoles.contains(Roles.lab), isFalse);
    });
  });

  group('a count says what it is counting', () {
    test('sacks and pieces are never the same noun', () {
      expect(counted(1, 'sacks'), '1 sack');
      expect(counted(40, 'sacks'), '40 sacks');
      expect(counted(1, 'pieces'), '1 piece');
      expect(counted(4000, 'pieces'), '4000 pieces');
    });
  });

  group('autoclave charges', () {
    test('only a special charge opens a batch', () {
      final special = autoclaveFormsFor(2200)
          .firstWhere((f) => f.name == 'Special 2200');
      final coarse = autoclaveFormsFor(2200)
          .firstWhere((f) => f.name == 'Coarse 2200');
      final drc =
          autoclaveFormsFor(2200).firstWhere((f) => f.name == 'DRC 2200');
      final specialDrc = autoclaveFormsFor(
        2200,
      ).firstWhere((f) => f.name == 'Special DRC 2200');

      expect(opensBatch(special), isTrue);
      // None is worked through in grades, so all are counted by their runs.
      expect(opensBatch(coarse), isFalse);
      expect(opensBatch(drc), isFalse);
      // The one that reads like a special charge and is not: it rides a special
      // vessel and its name starts with the word, but the grid has no row it
      // could ever mark, so a batch opened for it would never close.
      expect(opensBatch(specialDrc), isFalse);
    });

    test('every grade a charge can carry has a colour of its own', () {
      for (final form in autoclaveForms.where((f) => f.grade != null)) {
        expect(
          qualityColour[form.grade],
          isNotNull,
          reason: '${form.grade} has no chip colour',
        );
      }
    });

    test('a shared load costs one worker, a solo load two', () {
      expect(autoclaveWorkers(true), 1);
      expect(autoclaveWorkers(false), 2);
    });
  });
}
