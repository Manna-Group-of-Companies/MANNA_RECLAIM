/// Ticking a grade on a batch card.
///
/// The tick has to move under the thumb, and it has to go back if the server
/// refuses - those are the two halves, and the second is the one that would rot
/// quietly if nobody pinned it.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/models/models.dart';

Batch _batch({
  List<BatchGrade> grades = const [],
  int marked = 0,
  int weighed = 0,
  String label = 'mark qualities',
  bool autoclaveDone = true,
}) => Batch.fromJson({
  'id': 'B1',
  'ref': 'B1041',
  'machine_id': 'AC1',
  'status': 'open',
  'autoclave_done': autoclaveDone,
  'marked_count': marked,
  'weighed_count': weighed,
  'state_label': label,
  'grades': [
    for (final g in grades)
      {
        'quality': g.quality,
        'marked': g.marked,
        'refined': g.refined,
        'finished': g.finished,
        'weighed': g.weighed,
        'kg': g.kg,
      },
  ],
});

/// A grade that has been run and weighed, but not yet ticked.
BatchGrade _weighed(String quality, {bool marked = false}) => BatchGrade(
  quality: quality,
  marked: marked,
  refined: true,
  finished: true,
  weighed: true,
  kg: 240,
);

void main() {
  group('the tick moves before the server answers', () {
    test('ticking a grade marks it and lifts the count', () {
      final before = _batch(
        grades: [BatchGrade.blank('Fine')],
        marked: 0,
      );

      final after = before.withGradeMarked('Fine', true);

      expect(after.gradeRow('Fine').marked, isTrue);
      expect(after.markedCount, 1);
    });

    test('unticking puts both back', () {
      final before = _batch(
        grades: [
          const BatchGrade(
            quality: 'Fine',
            marked: true,
            refined: false,
            finished: false,
            weighed: false,
          ),
        ],
        marked: 1,
      );

      final after = before.withGradeMarked('Fine', false);

      expect(after.gradeRow('Fine').marked, isFalse);
      expect(after.markedCount, 0);
    });

    test('a grade the API left out appears when it is ticked', () {
      // A grade nothing has been logged against yet is not in `grades` at all;
      // ticking it is how it first shows up.
      final before = _batch(grades: const [], marked: 0);

      final after = before.withGradeMarked('SuperFine', true);

      expect(after.gradeRow('SuperFine').marked, isTrue);
      expect(after.markedCount, 1);
    });

    test('the count never goes below nothing', () {
      final before = _batch(grades: [BatchGrade.blank('Fine')], marked: 0);
      expect(before.withGradeMarked('Fine', false).markedCount, 0);
    });
  });

  group('the Weighed column and the chip move with the tick', () {
    // These are what still lagged after the tick itself was made optimistic:
    // the box moved, and the count and the chip beside it did not until the
    // server answered. Both are derived on the server in lifecycleOf(), and
    // withGradeMarked mirrors it.

    test('ticking a grade already weighed lifts the weighed count too', () {
      // The runs are already logged and the kg are against it - the tick is
      // what admits the grade to the grid, so it counts as weighed at once.
      final before = _batch(grades: [_weighed('Fine')], marked: 0, weighed: 0);

      final after = before.withGradeMarked('Fine', true);

      expect(after.markedCount, 1);
      expect(after.weighedCount, 1);
    });

    test('ticking a grade nothing has been run off does not', () {
      final before = _batch(grades: [BatchGrade.blank('Fine')]);

      final after = before.withGradeMarked('Fine', true);

      expect(after.markedCount, 1);
      expect(after.weighedCount, 0);
    });

    test('the chip reads n/m weighed as soon as the first grade is on', () {
      final before = _batch(
        grades: [_weighed('Fine'), BatchGrade.blank('Medium')],
        label: 'mark qualities',
      );

      expect(before.withGradeMarked('Fine', true).stateLabel, '1/1 weighed');
    });

    test('the chip goes back to "mark qualities" when the last one is off', () {
      final before = _batch(
        grades: [_weighed('Fine', marked: true)],
        marked: 1,
        weighed: 1,
        label: '1/1 weighed',
      );

      expect(before.withGradeMarked('Fine', false).stateLabel, 'mark qualities');
    });

    test('a grade ticked but not yet weighed shows as outstanding', () {
      final before = _batch(
        grades: [_weighed('Fine'), BatchGrade.blank('Medium')],
      );

      final after = before
          .withGradeMarked('Fine', true)
          .withGradeMarked('Medium', true);

      // Two marked, one weighed - which is what the card's button reads, and
      // what stops it offering Close before the batch is done.
      expect(after.stateLabel, '1/2 weighed');
      expect(after.markedCount, 2);
      expect(after.weighedCount, 1);
    });

    test('a batch still in the vessel keeps the chip the server sent', () {
      // It cannot be ticked at all - the card refuses it and says to unload the
      // autoclave first - so "In autoclave" is not ours to overwrite.
      final before = _batch(
        grades: [BatchGrade.blank('Fine')],
        autoclaveDone: false,
        label: 'In autoclave',
      );

      expect(before.withGradeMarked('Fine', true).stateLabel, 'In autoclave');
    });
  });

  group('what a tick must not invent', () {
    test('the three stage columns are left to the API', () {
      // Refined, finished and weighed are derived from the runs logged against
      // the batch number. A client guessing at them would be inventing plant
      // history, so a tick moves the tick and nothing else.
      final before = _batch(
        grades: [
          const BatchGrade(
            quality: 'Fine',
            marked: false,
            refined: true,
            finished: true,
            weighed: false,
            kg: 240,
          ),
        ],
        marked: 0,
      );

      final row = before.withGradeMarked('Fine', true).gradeRow('Fine');

      expect(row.refined, isTrue);
      expect(row.finished, isTrue);
      expect(row.weighed, isFalse);
      expect(row.kg, 240);
    });

    test('the other grades are untouched', () {
      final before = _batch(
        grades: [
          const BatchGrade(
            quality: 'Fine',
            marked: false,
            refined: false,
            finished: false,
            weighed: false,
          ),
          const BatchGrade(
            quality: 'Medium',
            marked: true,
            refined: true,
            finished: false,
            weighed: false,
          ),
        ],
        marked: 1,
      );

      final after = before.withGradeMarked('Fine', true);

      expect(after.gradeRow('Medium').marked, isTrue);
      expect(after.gradeRow('Medium').refined, isTrue);
      expect(after.grades.length, 2);
    });

    test('the batch it came from is not mutated, so a refusal can undo it', () {
      // The rollback in BatchesStore.setQuality keeps the previous list and
      // puts it back. That only works while the old rows are still intact.
      final before = _batch(grades: [BatchGrade.blank('Fine')], marked: 0);

      before.withGradeMarked('Fine', true);

      expect(before.gradeRow('Fine').marked, isFalse);
      expect(before.markedCount, 0);
    });
  });
}
