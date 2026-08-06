/// Every call this app makes to the Node/Express API.
///
/// A port of client/src/api/services/*. The backend is untouched: each method
/// below hits the same route with the same body the React client sends, so the
/// two apps are interchangeable from the server's point of view.
///
/// What is deliberately absent is as much a decision as what is here:
///
///   * no `/quality-tests` writes. Filing a verdict is the lab's and stays in
///     the React website with the Quality module. The one quality route this
///     app touches is the plain `GET /quality-tests`, which the Batches tab
///     reads so a held batch can wear its chip - see [QualityReadService].
///   * no `/users`. Accounts are the back office's.
///   * no `GET /stock`. The yard's read is `/stock/summary`, which is a
///     different response from a different serializer - the supervisor is
///     refused the full ledger at the route, not merely shown less of it.
///   * no `/rates/cost-rates`. The dispatch form reads `/rates/loading-rates`,
///     which is two numbers, rather than the plant's whole cost model.
library;

import '../core/api/api_client.dart';
import '../core/config/endpoints.dart';
import '../core/models/models.dart';

// ---------------------------------------------------------------- auth -----

class Session {
  const Session({required this.user, required this.accessToken});
  final User user;
  final String accessToken;
}

class AuthService {
  AuthService(this._api);
  final ApiClient _api;

  Future<Session> login({required String name, required String pin}) async {
    final data = await _api.post<Map<String, dynamic>>(
      Endpoints.authLogin,
      body: {'name': name, 'pin': pin},
      parse: asMap,
    );
    final session = Session(
      user: User.fromJson(asMap(data['user'])),
      accessToken: data['accessToken']?.toString() ?? '',
    );
    await _api.tokens.set(session.accessToken);
    return session;
  }

  Future<User> me() =>
      _api.get(Endpoints.authMe, parse: (d) => User.fromJson(asMap(d)));

  /// Drops the token whatever the server says. Leaving the user in place when
  /// the call fails - offline, rate-limited, already expired - would leave the
  /// app half signed in: no token, but a user the guards still see.
  Future<void> logout() async {
    try {
      await _api.post<void>(Endpoints.authLogout, parse: (_) {});
    } finally {
      await _api.tokens.clear();
      await _api.cookies.deleteAll();
    }
  }
}

// ------------------------------------------------------------ machines -----

class GroupedMachines {
  const GroupedMachines(this.rows, this.groups);
  final List<Machine> rows;

  /// Machines by the group heading the Machines tab prints them under, in the
  /// order the server sent them.
  final Map<String, List<Machine>> groups;
}

class MachineService {
  MachineService(this._api);
  final ApiClient _api;

  Future<GroupedMachines> grouped() =>
      _api.get(Endpoints.machinesGrouped, parse: (d) {
        final data = asMap(d);
        final rows = asList(data['rows']).map(Machine.fromJson).toList();
        final groups = <String, List<Machine>>{};
        final raw = data['groups'];
        if (raw is Map) {
          raw.forEach((key, value) {
            groups[key.toString()] = asList(value).map(Machine.fromJson).toList();
          });
        }
        return GroupedMachines(rows, groups);
      });
}

// ------------------------------------------------------------ products -----

class ProductService {
  ProductService(this._api);
  final ApiClient _api;

  /// What a press start sheet offers - the products still in use.
  Future<List<Product>> listActive() async {
    final res = await _api.getPaged(
      Endpoints.products,
      query: {'active': true, 'limit': 100},
      parse: Product.fromJson,
    );
    return res.rows;
  }
}

// ------------------------------------------------------------- batches -----

class BatchService {
  BatchService(this._api);
  final ApiClient _api;

  /// Open batches only: the batch list and every refiner picker on the floor.
  Future<List<Batch>> listOpen() async {
    final res = await _api.getPaged(
      Endpoints.batchesOpen,
      query: {'limit': 100},
      parse: Batch.fromJson,
    );
    return res.rows;
  }

  Future<BatchDetail> getOne(String id) => _api.get(
    Endpoints.batch(id),
    parse: (d) => BatchDetail.fromJson(asMap(d)),
  );

  /// Only ever called by the autoclave load sheet - the server checks that.
  Future<Batch> create(Map<String, dynamic> payload) => _api.post(
    Endpoints.batches,
    body: payload,
    parse: (d) => Batch.fromJson(asMap(d)),
  );

  /// Ticks a grade the batch will yield, or takes one back off.
  Future<Batch> setQuality(String id, String quality, bool marked) => _api.post(
    Endpoints.batchQualities(id),
    body: {'quality': quality, 'marked': marked},
    parse: (d) => Batch.fromJson(asMap(d)),
  );

  Future<Batch> close(String id, {String? remarks}) => _api.post(
    Endpoints.batchClose(id),
    body: {'remarks': remarks},
    parse: (d) => Batch.fromJson(asMap(d)),
  );

  /// Orphans only. Takes the batch's quality tests with it.
  Future<BatchDeleted> remove(String id) => _api.delete(
    Endpoints.batch(id),
    parse: (d) => BatchDeleted.fromJson(asMap(d)),
  );
}

// ---------------------------------------------------------------- runs -----

class RunService {
  RunService(this._api);
  final ApiClient _api;

  Future<Paged<Run>> list(Map<String, dynamic> query) =>
      _api.getPaged(Endpoints.runs, query: query, parse: Run.fromJson);

  Future<List<Run>> listActive() async =>
      (await _api.getPaged(Endpoints.runsActive, parse: Run.fromJson)).rows;

  /// Finished runs on a weighed machine still waiting for their out-weight.
  Future<List<Run>> listPendingWeigh() async => (await _api.getPaged(
    Endpoints.runsPendingWeigh,
    query: {'limit': 100},
    parse: Run.fromJson,
  )).rows;

  /// Runs already weighed, newest first - what the Weigh tab corrects from.
  /// `all` asks for the plant's whole record rather than the newest page.
  Future<Paged<Run>> listWeighed({bool all = false, int limit = 20}) =>
      _api.getPaged(
        Endpoints.runsWeighed,
        query: all ? {'all': true} : {'limit': limit},
        parse: Run.fromJson,
      );

  /// Weighed runs that still have full sacks to bag, and press runs to box.
  Future<List<Run>> listPendingPack() async => (await _api.getPaged(
    Endpoints.runsPendingPack,
    query: {'limit': 100},
    parse: Run.fromJson,
  )).rows;

  Future<Paged<Run>> byShift({String? date, String? shift}) => _api.getPaged(
    Endpoints.runsShift,
    query: {'date': date, 'shift': shift, 'limit': 200},
    parse: Run.fromJson,
  );

  Future<Run> start(Map<String, dynamic> payload) => _api.post(
    Endpoints.runsStart,
    body: payload,
    parse: (d) => Run.fromJson(asMap(d)),
  );

  Future<Run> stop(String id, Map<String, dynamic> payload) => _api.post(
    Endpoints.runStop(id),
    body: payload,
    parse: (d) => Run.fromJson(asMap(d)),
  );

  /// Records the out-weight of a run that has already finished - and corrects
  /// one already weighed, which is the same write. `entries` are the individual
  /// weighings the total came off, kept so a correction can show them.
  Future<Run> weigh(String id, num outWeight, {List<num>? entries}) => _api.post(
    Endpoints.runWeigh(id),
    body: {
      'outWeight': outWeight,
      if (entries != null) 'entries': entries,
    },
    parse: (d) => Run.fromJson(asMap(d)),
  );

  /// Replaces the running tally on a machine that is still going. The whole
  /// list goes every time, so adding a load and removing one are the same call.
  Future<Run> tally(String id, List<num> entries) => _api.post(
    Endpoints.runTally(id),
    body: {'entries': entries},
    parse: (d) => Run.fromJson(asMap(d)),
  );

  /// Takes the weighing back off a run and puts it back on the scale queue.
  /// Not [remove]: the run stays. It happened, the machine logged its hours,
  /// and the reports are added up off that row.
  Future<UnweighedRun> unweigh(String id) => _api.delete(
    Endpoints.runWeigh(id),
    parse: (d) => UnweighedRun.fromJson(asMap(d)),
  );

  /// Records the sacks bagged, or the pieces boxed, off a finished run.
  Future<Run> pack(String id, Map<String, dynamic> payload) => _api.post(
    Endpoints.runPack(id),
    body: payload,
    parse: (d) => Run.fromJson(asMap(d)),
  );

  /// Takes the packing back off a run and the stock back out of the yard.
  Future<UnpackedRun> unpack(String id) => _api.delete(
    Endpoints.runPack(id),
    parse: (d) => UnpackedRun.fromJson(asMap(d)),
  );

  /// Corrects a logged run - the History tab.
  Future<Run> update(String id, Map<String, dynamic> payload) => _api.patch(
    Endpoints.run(id),
    body: payload,
    parse: (d) => Run.fromJson(asMap(d)),
  );

  /// Takes a logged run off the record for good. There is no way back from it,
  /// so the tab confirms against the named run before it calls this.
  Future<RemovedRun> remove(String id) => _api.delete(
    Endpoints.run(id),
    parse: (d) => RemovedRun.fromJson(asMap(d)),
  );

  /// Discards a run started by mistake - nothing is logged against it.
  Future<void> cancel(String id) =>
      _api.post<void>(Endpoints.runCancel(id), parse: (_) {});

  Future<Run> pause(String id, bool paused) => _api.post(
    Endpoints.runPause(id),
    body: {'paused': paused},
    parse: (d) => Run.fromJson(asMap(d)),
  );
}

// --------------------------------------------------------------- stock -----

class StockService {
  StockService(this._api);
  final ApiClient _api;

  /// The yard as the shop floor reads it: the physical facts about the goods
  /// and none of the commercial ones. Lists everything in every QC state -
  /// nothing is filtered out for being unsellable, because a group the lab
  /// failed is still stock standing in the yard.
  Future<List<StockSummaryRow>> summary() async => (await _api.getPaged(
    Endpoints.stockSummary,
    query: {'limit': 200},
    parse: StockSummaryRow.fromJson,
  )).rows;

  /// The coarse pools, for the sampling line on their cards. A separate call
  /// because the samples live with the lab's tests rather than on the stock
  /// row, and it is allowed to fail on its own: the yard is worth showing
  /// without the sampling progress on it.
  Future<List<StockPool>> pools() async => (await _api.getPaged(
    Endpoints.stockPools,
    query: {'limit': 60},
    parse: StockPool.fromJson,
  )).rows;
}

// ------------------------------------------------------------ dispatch -----

class DispatchService {
  DispatchService(this._api);
  final ApiClient _api;

  /// What has gone out lately, newest first. A header list - so it stays cheap
  /// enough to sit at the top of a screen the crew opens all day.
  Future<List<DispatchSummary>> recent({int limit = 8}) async =>
      (await _api.getPaged(
        Endpoints.dispatches,
        query: {'limit': limit},
        parse: DispatchSummary.fromJson,
      )).rows;

  /// Posted once, never edited: a load that went out wrong is corrected by a
  /// reversal document and a fresh dispatch. A 409 means the yard moved under
  /// the form and nothing was written.
  Future<DispatchDoc> create(Map<String, dynamic> payload) => _api.post(
    Endpoints.dispatches,
    body: payload,
    parse: (d) => DispatchDoc.fromJson(asMap(d)),
  );
}

class CustomerService {
  CustomerService(this._api);
  final ApiClient _api;

  Future<List<Customer>> list() async => (await _api.getPaged(
    Endpoints.customers,
    query: {'limit': 200, 'order': 'asc'},
    parse: Customer.fromJson,
  )).rows;

  /// What this customer last paid per grade. A prefill for the dispatch form
  /// and never a default it applies quietly - a price carried over from months
  /// ago is exactly what goes out wrong and is only noticed on the invoice.
  Future<Map<String, num>> lastPrices(String id) =>
      _api.get(Endpoints.customerLastPrices(id), parse: (d) {
        final map = asMap(d);
        return map.map((k, v) => MapEntry(k, (v as num?) ?? 0));
      });
}

class RateService {
  RateService(this._api);
  final ApiClient _api;

  /// The two figures a loading job is costed by, for the dispatch form's
  /// running total. Its own route rather than the whole cost model, which stays
  /// the back office's.
  Future<({num perKg, num perHour})> loadingRates() =>
      _api.get(Endpoints.loadingRates, parse: (d) {
        final data = asMap(asMap(d)['data']);
        return (
          perKg: (data['loadingPerKg'] as num?) ?? 0,
          perHour: (data['loadingLabourPerHour'] as num?) ?? 0,
        );
      });
}

// --------------------------------------------------------- maintenance -----

class MaintenanceService {
  MaintenanceService(this._api);
  final ApiClient _api;

  /// Machines currently flagged DOWN.
  Future<List<MaintenanceLog>> listOpen() async => (await _api.getPaged(
    Endpoints.maintenance,
    query: {'status': 'open', 'limit': 50},
    parse: MaintenanceLog.fromJson,
  )).rows;

  Future<MaintenanceLog> markDown({
    required String machineId,
    String? machine,
    String? downStart,
  }) => _api.post(
    Endpoints.maintenance,
    body: {
      'machineId': machineId,
      if (machine != null) 'machine': machine,
      if (downStart != null) 'downStart': downStart,
    },
    parse: (d) => MaintenanceLog.fromJson(asMap(d)),
  );

  /// All three answers are required: cause, fix, and what stops it recurring.
  Future<MaintenanceLog> resolve(
    String id, {
    required String rootCause,
    required String resolution,
    required String prevention,
  }) => _api.post(
    Endpoints.maintenanceResolve(id),
    body: {
      'rootCause': rootCause,
      'resolution': resolution,
      'prevention': prevention,
    },
    parse: (d) => MaintenanceLog.fromJson(asMap(d)),
  );

  /// Withdraws a breakdown reported by mistake - nothing is kept.
  Future<void> cancel(String id) =>
      _api.delete<void>(Endpoints.maintenanceById(id), parse: (_) {});

  Future<List<BearingLog>> bearings({int limit = 100}) async =>
      (await _api.getPaged(
        Endpoints.bearings,
        query: {'limit': limit},
        parse: BearingLog.fromJson,
      )).rows;

  /// One reading covers every position, so this returns a row per position.
  Future<List<BearingLog>> logBearings({
    required String machineId,
    String? machine,
    required String kind,
    required List<({String position, num tempC})> readings,
    String? supervisor,
    String? shiftDate,
    String? shift,
    String? ts,
  }) => _api.post(
    Endpoints.bearings,
    body: {
      'machineId': machineId,
      if (machine != null) 'machine': machine,
      'kind': kind,
      'readings': readings
          .map((r) => {'position': r.position, 'tempC': r.tempC})
          .toList(),
      if (supervisor != null) 'supervisor': supervisor,
      if (shiftDate != null) 'shiftDate': shiftDate,
      if (shift != null) 'shift': shift,
      if (ts != null) 'ts': ts,
    },
    parse: (d) => asList(d).map(BearingLog.fromJson).toList(),
  );

  Future<List<BearingDue>> due() => _api.get(
    Endpoints.bearingsDue,
    parse: (d) => asList(d).map(BearingDue.fromJson).toList(),
  );
}

// ------------------------------------------------------------- reports -----

/// One call, and it is the History tab's pickers.
///
/// The production headline and the lab's pass rates were the other two, and
/// they went with the Reports page - both are still on the website.
class ReportService {
  ReportService(this._api);
  final ApiClient _api;

  /// Days, shifts, batches and machines the run history covers.
  Future<RunFilters> filters() => _api.get(
    Endpoints.reportsFilters,
    parse: (d) => RunFilters.fromJson(asMap(d)),
  );
}

/// The one read this app makes of the lab's record.
///
/// `GET /quality-tests` is open to everyone signed in on purpose - see the note
/// on the route - because the Batches tab warns on a held batch and the floor
/// has to see a verdict it cannot write. There is no write here and there is no
/// route for one: `POST /quality-tests` is gated to QUALITY_WRITE_ROLES, which
/// a supervisor is not on, and the whole Quality module stays in the React
/// website.
class QualityReadService {
  QualityReadService(this._api);
  final ApiClient _api;

  Future<List<QualityVerdict>> recentVerdicts({int limit = 200}) async =>
      (await _api.getPaged(
        '/quality-tests',
        query: {'limit': limit},
        parse: QualityVerdict.fromJson,
      )).rows;
}
