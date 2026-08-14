import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/config/constants.dart';
import '../core/models/models.dart';
import '../core/utils/formats.dart';
import '../services/services.dart';
import 'ui_store.dart';

/// The runs slice: every list of runs the floor works from, and every write
/// that moves one between them.
///
/// A port of client/src/features/machines/runsSlice.ts. The queue-moving in the
/// reducers is the part worth keeping faithfully: weighing a run is what makes
/// it packable, so it moves onto the packing bench in the same beat rather than
/// leaving that tab a refresh behind.
class RunsStore extends ChangeNotifier {
  RunsStore(this._runs, this._ui);

  final RunService _runs;
  final UiStore _ui;

  List<Run> active = const [];

  /// Finished runs on a weighed machine that still owe an out-weight.
  List<Run> pendingWeigh = const [];

  /// Runs already weighed, newest first - the Weigh tab's correction list.
  List<Run> weighed = const [];

  /// How many there are altogether, so the tab can say "latest 20 of 414".
  int weighedTotal = 0;

  /// Whether [weighed] holds the whole record or only the newest page of it.
  bool weighedAll = false;

  /// Weighed runs that still have full sacks to bag, and press runs to box.
  List<Run> pendingPack = const [];

  /// The shift the Machines tab reads "last run" off.
  List<Run> shift = const [];

  bool loading = false;
  String? error;

  // ---- reads ----------------------------------------------------------

  Future<void> fetchActive() async {
    loading = true;
    notifyListeners();
    try {
      active = await _runs.listActive();
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> fetchPendingWeigh() async {
    try {
      pendingWeigh = await _runs.listPendingWeigh();
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }

  Future<void> fetchWeighed({bool all = false}) async {
    try {
      final res = await _runs.listWeighed(all: all, limit: weighedPage);
      weighed = res.rows;
      weighedTotal = res.meta.total == 0 ? res.rows.length : res.meta.total;
      weighedAll = all;
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }

  Future<void> fetchPendingPack() async {
    try {
      pendingPack = await _runs.listPendingPack();
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }

  Future<void> fetchShift({String? date, String? shiftName}) async {
    try {
      final res = await _runs.byShift(date: date, shift: shiftName);
      shift = res.rows;
      notifyListeners();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }

  // ---- writes ---------------------------------------------------------

  /// Starts a run. The row lands on [active] so the machine card turns over
  /// straight away.
  Future<Run?> start(Map<String, dynamic> payload) async {
    try {
      final run = await _runs.start(payload);
      active = [...active, run];
      notifyListeners();
      return run;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Stops a run.
  ///
  /// A shiftwise stop can be folded into the record the shift already has, in
  /// which case the row it was logged on is gone and what comes back is the
  /// merged one under a different id - so both have to leave [active], and the
  /// shift list gets the merged row in place of its earlier self rather than a
  /// second copy of the same shift.
  Future<Run?> stop(String id, Map<String, dynamic> payload) async {
    try {
      final run = await _runs.stop(id, payload);
      final gone = <String>{run.id, if (run.mergedFrom != null) run.mergedFrom!};
      active = active.where((r) => !gone.contains(r.id)).toList();
      shift = [run, ...shift.where((r) => !gone.contains(r.id))];
      pendingWeigh = pendingWeigh.where((r) => !gone.contains(r.id)).toList();
      // A weighed machine drops straight onto the Weigh tab when it stops
      // without a weight - carrying whatever was tallied while it ran.
      if (run.outWeight == null &&
          run.weightKg == null &&
          ((run.needsWeight ?? false) || (run.needsWeigh ?? false))) {
        pendingWeigh = [run, ...pendingWeigh];
      }
      notifyListeners();
      return run;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Discards a run started by mistake. The row is gone, so the machine goes
  /// straight back to idle.
  Future<bool> cancel(String id) async {
    try {
      await _runs.cancel(id);
      active = active.where((r) => r.id != id).toList();
      notifyListeners();
      return true;
    } on ApiException {
      return false;
    }
  }

  Future<bool> pause(String id, bool paused) async {
    try {
      final run = await _runs.pause(id, paused);
      active = active.map((r) => r.id == run.id ? run : r).toList();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }

  /// Banks the running tally on a machine that is still going. The whole list
  /// is sent, so this is both "add a load" and "take one off".
  Future<bool> tally(String id, List<num> entries) async {
    try {
      final run = await _runs.tally(id, entries);
      active = active.map((r) => r.id == run.id ? run : r).toList();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }

  /// Records an out-weight, and moves the run onto the packing bench.
  ///
  /// Weighing is what makes a run packable, so it moves queue rather than
  /// leaving the Packing tab a refresh behind. A correction to a run already
  /// there replaces it - it must not be listed twice.
  Future<Run?> weigh(String id, num outWeight, List<num> entries) async {
    try {
      final run = await _runs.weigh(id, outWeight, entries: entries);
      pendingWeigh = pendingWeigh.where((r) => r.id != run.id).toList();
      shift = shift.map((r) => r.id == run.id ? run : r).toList();

      if (pendingPack.any((r) => r.id == run.id)) {
        pendingPack = _stillPacking(run)
            ? pendingPack.map((r) => r.id == run.id ? run : r).toList()
            : pendingPack.where((r) => r.id != run.id).toList();
      } else if (_stillPacking(run)) {
        pendingPack = [run, ...pendingPack];
      }

      // Same for the weighed list this correction may have come from: a run
      // weighed for the first time joins it and lifts the count with it.
      if (weighed.any((r) => r.id == run.id)) {
        weighed = weighed.map((r) => r.id == run.id ? run : r).toList();
      } else {
        weighed = [run, ...weighed];
        weighedTotal += 1;
      }
      notifyListeners();
      return run;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Clears the weighing off a run and puts it back on the queue above.
  ///
  /// The run is not deleted. What this does is send a card from the bottom list
  /// to the top one - and it also takes it off the packing bench, because there
  /// is nothing to bag off a run that has not been weighed. The refresh goes
  /// out for the same reason it does on [unpack]: what this changes is mostly
  /// not on the Weigh tab.
  Future<UnweighedRun?> unweigh(String id) async {
    try {
      final undone = await _runs.unweigh(id);
      final run = undone.run;
      shift = shift.map((r) => r.id == run.id ? run : r).toList();
      pendingPack = pendingPack.where((r) => r.id != run.id).toList();
      if (weighed.any((r) => r.id == run.id)) {
        weighed = weighed.where((r) => r.id != run.id).toList();
        weighedTotal = weighedTotal > 0 ? weighedTotal - 1 : 0;
      }
      if (!pendingWeigh.any((r) => r.id == run.id)) {
        // `needsWeight` is set here rather than read off the answer: the flag
        // is what the pending-weigh route stamps on its own rows, and this run
        // is being put on that list by hand rather than fetched from it.
        pendingWeigh = [run.copyWithNeedsWeight(true), ...pendingWeigh];
      }
      _ui.requestRefresh();
      notifyListeners();
      return undone;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Records the sacks bagged, or the pieces boxed, off a finished run.
  Future<Run?> pack(String id, Map<String, dynamic> payload) async {
    try {
      final run = await _runs.pack(id, payload);
      shift = shift.map((r) => r.id == run.id ? run : r).toList();
      pendingPack = _stillPacking(run)
          ? pendingPack.map((r) => r.id == run.id ? run : r).toList()
          : pendingPack.where((r) => r.id != run.id).toList();
      // What is counted here is stock from here on, so the yard is stale.
      _ui.requestRefresh();
      notifyListeners();
      return run;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Undoes a packing, and tells the rest of the app the yard has moved.
  ///
  /// The refresh is half the point. What this call changes is mostly not on the
  /// Packing tab at all: sacks come off a stock group and the group goes
  /// entirely when this run was the only thing in it, so the Stock tab is stale
  /// the moment it returns.
  ///
  /// [_stillPacking] decides whether the card goes back on the bench, rather
  /// than the run being pushed on unconditionally - a run whose weight never
  /// amounted to a full sack was not on that list before it was packed either,
  /// and putting it there now would be a card the bench can open and cannot
  /// complete.
  Future<UnpackedRun?> unpack(String id) async {
    try {
      final undone = await _runs.unpack(id);
      final run = undone.run;
      shift = shift.map((r) => r.id == run.id ? run : r).toList();
      if (pendingPack.any((r) => r.id == run.id)) {
        pendingPack = pendingPack.map((r) => r.id == run.id ? run : r).toList();
      } else if (_stillPacking(run)) {
        pendingPack = [run, ...pendingPack];
      }
      _ui.requestRefresh();
      notifyListeners();
      return undone;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return null;
    }
  }

  /// Same rule as the server: a run is done packing when there is nothing left
  /// on it worth filing.
  ///
  /// On a bagged run that means under one sack of material left, because the
  /// remainder is carried into the next batch of that grade rather than bagged.
  /// On anything counted by the piece - a press, and the sleeve and loop
  /// benches - it means every piece it made has been boxed: there is no weight
  /// to divide and no remainder to carry, so the comparison is between two
  /// counts.
  static bool _stillPacking(Run run) {
    if (run.kind == 'press' || isMoulding(run.kind)) {
      return (run.pieces ?? 0) > (run.packedPieces ?? 0);
    }
    final total = round2(run.weight + (run.leftoutIn ?? 0));
    final packed = (run.packedSacks ?? 0) * sackKg;
    return run.packedSacks == null || total - packed >= sackKg;
  }
}
