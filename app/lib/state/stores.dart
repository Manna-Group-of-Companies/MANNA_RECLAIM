/// The remaining slices, ported one to one from client/src/features/*.
///
/// Each is a ChangeNotifier holding what its Redux counterpart held, with the
/// same thunks as methods. Where a reducer patched a list in place rather than
/// refetching, so does this - that behaviour is what keeps a tab from being a
/// round trip behind the write that just happened on it.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/models/models.dart';
import '../services/services.dart';
import 'ui_store.dart';

// ------------------------------------------------------------ machines -----

class MachinesStore extends ChangeNotifier {
  MachinesStore(this._service);
  final MachineService _service;

  List<Machine> items = const [];

  /// Machines by the heading the Machines tab prints them under, in the order
  /// the server sent them - insertion order is the plant's line order.
  Map<String, List<Machine>> groups = const {};
  bool loading = false;
  String? error;

  Machine? byId(String id) {
    for (final m in items) {
      if (m.id == id) return m;
    }
    return null;
  }

  Future<void> fetch() async {
    loading = true;
    notifyListeners();
    try {
      final grouped = await _service.grouped();
      items = grouped.rows;
      groups = grouped.groups;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}

// ------------------------------------------------------------- batches -----

class BatchesStore extends ChangeNotifier {
  BatchesStore(this._service, this._quality, this._ui);
  final BatchService _service;
  final QualityReadService _quality;
  final UiStore _ui;

  List<Batch> items = const [];
  bool loading = false;
  String? error;

  BatchDetail? detail;
  bool detailLoading = false;

  /// Batch numbers the lab has put on hold, so the card can say so.
  ///
  /// Worked out here rather than fetched: there is no "held batches" endpoint,
  /// so this pairs the open batches against the verdicts on record. A batch is
  /// held once the verdict that stands for any of its grades is a hold - tests
  /// are append-only, so the newest one for a grade is the current answer.
  Set<String> held = const {};

  /// The batches a refiner may be pointed at: open, and out of the autoclave.
  /// A charge still cooking has nothing to refine yet, so it cannot be mixed
  /// into another batch's tailings.
  ///
  /// Off [items] and deliberately never off [archive]: the archive holds closed
  /// batches and the coarse and DRC charges too, and not one of those is
  /// something a refiner may be pointed at.
  List<Batch> get refinable =>
      items.where((b) => b.autoclaveDone).toList(growable: false);

  /// What the Batch pick offers: every open batch, cooking ones included.
  ///
  /// It used to be [refinable], which read as "these are all the batches there
  /// are" and hid a charge the crew could see through the vessel door. One
  /// still in the autoclave now shows with its state where its stage times
  /// would be, so the pick says why it is not ready rather than leaving the
  /// number off the screen.
  List<Batch> get pickable => items;

  /// Every batch on record, for the Batches tab's All and Closed filters.
  ///
  /// Kept apart from [items] rather than replacing it, because [items] is what
  /// the floor works from - the card list it acts on and, through [refinable],
  /// every refiner picker. Folding a few hundred closed batches into that would
  /// put a charge finished in March on a picker at a machine.
  ///
  /// Loaded when somebody first asks for it and then kept, so moving between
  /// the chips is instant. [fetchOpen] clears it, so a pull-to-refresh is what
  /// picks up a batch closed since.
  List<Batch> archive = const [];
  bool archiveLoading = false;
  String? archiveError;

  /// Which chip the Batches tab is on. '' is All, matching FilterChips, and
  /// 'open' is where it starts - the list this tab has always opened on.
  String scope = 'open';

  /// The batches the tab is showing, which is the only thing [scope] decides.
  List<Batch> get visible => switch (scope) {
    'open' => items,
    'closed' => archive.where((b) => b.status == 'closed').toList(growable: false),
    _ => archive,
  };

  Future<void> setScope(String next) async {
    scope = next;
    notifyListeners();
    // Nothing to fetch for the open list - it is already loaded, and it is what
    // this tab loads on the way in.
    if (next != 'open' && archive.isEmpty && !archiveLoading) await fetchArchive();
  }

  Future<void> fetchArchive() async {
    archiveLoading = true;
    archiveError = null;
    notifyListeners();
    try {
      archive = await _service.listAll();
    } on ApiException catch (e) {
      archiveError = e.message;
    } finally {
      archiveLoading = false;
      notifyListeners();
    }
  }

  Future<void> fetchOpen() async {
    loading = true;
    notifyListeners();
    try {
      items = await _service.listOpen();
      error = null;
      archive = const [];
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
    /*
     * The archive is dropped above rather than refreshed, because whoever is on
     * the open list may never look at the other chips - it is reloaded by the
     * tap that needs it, in setScope.
     *
     * Unless they are standing on one of those chips right now. Then a
     * pull-to-refresh that emptied the list they are looking at and left it
     * empty would read as every batch having just disappeared.
     */
    if (scope != 'open') await fetchArchive();
    // Quietly: the hold chip is an aside on the card, and a lab record that
    // could not be read is no reason to put an error over the batch list.
    unawaited(_refreshHeld());
  }

  Future<void> _refreshHeld() async {
    try {
      final verdicts = await _quality.recentVerdicts();
      final newest = <String, QualityVerdict>{};
      for (final v in verdicts) {
        if (v.kind != 'batch') continue;
        final ref = v.batchNo;
        if (ref == null || ref.isEmpty || v.grade.isEmpty) continue;
        final key = '$ref|${v.grade}';
        final standing = newest[key];
        if (standing == null || v.testedMs > standing.testedMs) {
          newest[key] = v;
        }
      }
      held = newest.values
          .where((v) => v.verdict == 'hold')
          .map((v) => v.batchNo!)
          .toSet();
      notifyListeners();
    } on ApiException {
      // leave the last answer standing
    }
  }

  Future<void> openDetail(String id) async {
    detail = null;
    detailLoading = true;
    notifyListeners();
    try {
      detail = await _service.getOne(id);
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
    } finally {
      detailLoading = false;
      notifyListeners();
    }
  }

  void clearDetail() {
    detail = null;
    detailLoading = false;
    notifyListeners();
  }

  /// Opening the batch an autoclave charge will be worked through as. Only ever
  /// called by the load sheet - the server checks that.
  Future<String?> create(Map<String, dynamic> payload) async {
    try {
      final batch = await _service.create(payload);
      items = [batch, ...items];
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Ticking a grade the batch will yield, or taking one back off. The server
  /// has the last word on both - it refuses a batch still in the autoclave, and
  /// refuses to untick a grade a refiner has already run - so its message is
  /// what comes back for the card to show.
  /// The tick moves first and the write follows it.
  ///
  /// It used to wait for the round trip, which on a tablet over the plant's
  /// wifi is a visible pause between the thumb and the box - long enough that a
  /// crew in gloves taps again, and long enough to feel broken. Nothing about
  /// the answer is needed to draw the tick: the card already knows which way it
  /// is going, and the two client-side rules that would refuse it - a batch
  /// still in the autoclave, a grade a refiner has already run - are checked
  /// before this is called at all.
  ///
  /// So the box moves now and the row is replaced by whatever the server sends
  /// back. If the write is refused the list goes back exactly as it was and the
  /// server's own message is returned for the card to show - which is the point
  /// of keeping the previous list rather than toggling the tick back: the
  /// answer may disagree with more than the one grade.
  Future<String?> setQuality(String id, String quality, bool marked) async {
    final before = items;
    items = items
        .map((b) => b.id == id ? b.withGradeMarked(quality, marked) : b)
        .toList();
    notifyListeners();

    try {
      _replace(await _service.setQuality(id, quality, marked));
      return null;
    } on ApiException catch (e) {
      items = before;
      notifyListeners();
      return e.message;
    }
  }

  /// Closing files the batch away: it drops off this list and every refiner
  /// picker that reads it, and stays on the record for dispatch and history.
  Future<String?> close(String id) async {
    try {
      final closed = await _service.close(id);
      items = items.where((b) => b.id != closed.id).toList();
      if (detail?.id == closed.id) detail = null;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Orphans only. Takes the batch's quality tests with it.
  Future<(BatchDeleted?, String?)> remove(String id) async {
    try {
      final gone = await _service.remove(id);
      items = items.where((b) => b.id != gone.id).toList();
      if (detail?.id == gone.id) detail = null;
      notifyListeners();
      return (gone, null);
    } on ApiException catch (e) {
      return (null, e.message);
    }
  }

  void _replace(Batch batch) {
    items = items.map((b) => b.id == batch.id ? batch : b).toList();
    notifyListeners();
  }
}

// ------------------------------------------------------------ products -----

/// What the presses mould. Read on the Machines tab because a press cannot be
/// started without one: the start sheet offers the list, and says what to do
/// when it is empty rather than opening a form with nothing to pick.
class ProductsStore extends ChangeNotifier {
  ProductsStore(this._service);
  final ProductService _service;

  List<Product> items = const [];

  /// Whether the list has been read at all, so "empty" can be told from
  /// "not yet". A connection that dropped is not an empty product list, and
  /// telling the crew to go and add one would send them after the wrong
  /// problem.
  bool loaded = false;
  bool loading = false;
  String? error;

  Product? byId(String? id) {
    if (id == null) return null;
    for (final p in items) {
      if (p.id == id) return p;
    }
    return null;
  }

  Future<void> fetch() async {
    loading = true;
    notifyListeners();
    try {
      items = await _service.listActive();
      loaded = true;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}

// --------------------------------------------------------- maintenance -----

class MaintenanceStore extends ChangeNotifier {
  MaintenanceStore(this._service, this._ui);
  final MaintenanceService _service;
  final UiStore _ui;

  /// Breakdowns still open - one per machine currently flagged DOWN.
  List<MaintenanceLog> open = const [];
  List<BearingLog> bearings = const [];
  List<BearingDue> due = const [];

  int get overdueCount => due.where((d) => d.due).length;

  MaintenanceLog? downFor(String machineId) {
    for (final l in open) {
      if (l.machineId == machineId) return l;
    }
    return null;
  }

  BearingDue? dueFor(String machineId) {
    for (final d in due) {
      if (d.machineId == machineId) return d;
    }
    return null;
  }

  Future<void> fetchOpen() async {
    try {
      open = await _service.listOpen();
      notifyListeners();
    } on ApiException {
      // The DOWN flags are an overlay on the machine cards; a failed read
      // leaves the last answer standing rather than blanking the tab.
    }
  }

  Future<void> fetchDue() async {
    try {
      due = await _service.due();
      notifyListeners();
    } on ApiException {
      // as above
    }
  }

  Future<void> fetchBearingLogs() async {
    try {
      bearings = await _service.bearings();
      notifyListeners();
    } on ApiException {
      // as above
    }
  }

  Future<bool> markDown({
    required String machineId,
    String? machine,
    String? downStart,
  }) async {
    try {
      final log = await _service.markDown(
        machineId: machineId,
        machine: machine,
        downStart: downStart,
      );
      open = [log, ...open];
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }

  Future<bool> logRepair(
    String id, {
    required String rootCause,
    required String resolution,
    required String prevention,
  }) async {
    try {
      final log = await _service.resolve(
        id,
        rootCause: rootCause,
        resolution: resolution,
        prevention: prevention,
      );
      open = open.where((l) => l.id != log.id).toList();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }

  /// Withdraws a breakdown that was reported by mistake.
  Future<bool> cancelDown(String id) async {
    try {
      await _service.cancel(id);
      open = open.where((l) => l.id != id).toList();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }

  /// One reading covers every position, so this writes a row per position and
  /// re-reads the schedule: logging is what moves a machine off "overdue".
  Future<bool> logBearings({
    required String machineId,
    String? machine,
    required String kind,
    required List<({String position, num tempC})> readings,
    String? supervisor,
    String? shiftDate,
    String? shift,
    String? ts,
  }) async {
    try {
      final logs = await _service.logBearings(
        machineId: machineId,
        machine: machine,
        kind: kind,
        readings: readings,
        supervisor: supervisor,
        shiftDate: shiftDate,
        shift: shift,
        ts: ts,
      );
      bearings = [...logs, ...bearings];
      notifyListeners();
      await fetchDue();
      return true;
    } on ApiException catch (e) {
      _ui.notify(e.message, ToastKind.err);
      return false;
    }
  }
}

// ------------------------------------------------------------- reports -----

/// What the History tab's pickers are filled from, and nothing else.
///
/// This was the Reports page's store as well until Reports came out of the app.
/// It keeps the name because what it wraps is still `/reports/*` - the run
/// history's day, shift, batch and machine lists are served by
/// `/reports/filters`, which is a different call from the production headline
/// and is the only one this app still makes.
class ReportsStore extends ChangeNotifier {
  ReportsStore(this._service);
  final ReportService _service;

  /// Days / shifts / batches / machines the history covers, for the pickers.
  RunFilters filters = RunFilters.empty;

  Future<void> fetchFilters() async {
    try {
      filters = await _service.filters();
      notifyListeners();
    } on ApiException {
      // The pickers fall back to "All", which still lists everything.
    }
  }
}
