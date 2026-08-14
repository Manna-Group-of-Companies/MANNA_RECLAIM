import 'dart:async';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import 'request_log.dart';

/// One field the server said was wrong, as the validation middleware sends it.
class FieldError {
  const FieldError({required this.field, required this.message, this.label});
  final String field;
  final String message;

  /// The stock group label a 409 named, so a form can put the refusal on the
  /// right line rather than at the bottom of the sheet.
  final String? label;

  factory FieldError.fromJson(Map<String, dynamic> j) => FieldError(
    field: j['field']?.toString() ?? '',
    message: j['message']?.toString() ?? '',
    label: j['label']?.toString(),
  );
}

/// Pagination, as the envelope's `meta` carries it. `/runs/shift` also echoes
/// back which shift it resolved to, which is why those two are here.
class PageMeta {
  const PageMeta({
    this.total = 0,
    this.page = 1,
    this.limit = 0,
    this.pages = 0,
    this.shiftDate,
    this.shift,
  });

  final int total;
  final int page;
  final int limit;
  final int pages;
  final String? shiftDate;
  final String? shift;

  factory PageMeta.fromJson(Map<String, dynamic> j) => PageMeta(
    total: (j['total'] as num?)?.round() ?? 0,
    page: (j['page'] as num?)?.round() ?? 1,
    limit: (j['limit'] as num?)?.round() ?? 0,
    pages: (j['pages'] as num?)?.round() ?? 0,
    shiftDate: j['shift_date']?.toString(),
    shift: j['shift']?.toString(),
  );
}

/// Rows plus the pagination meta beside them.
class Paged<T> {
  const Paged(this.rows, this.meta);
  final List<T> rows;
  final PageMeta meta;
}

/// A failed request, in the words to show it in.
///
/// The server's own message is kept unchanged wherever it exists. Every refusal
/// this API makes names where the work actually is - "undo the packing on the
/// Packing tab", "reverse the dispatch" - and rewording that into "could not
/// save" throws away the only useful half of the answer.
class ApiException implements Exception {
  const ApiException(this.message, {this.status, this.errors = const []});

  final String message;
  final int? status;
  final List<FieldError> errors;

  /// The yard moved under the form: another vehicle took the sacks first, or
  /// the group has not passed QC. Nothing was written.
  bool get isConflict => status == 409;

  @override
  String toString() => message;
}

/// Where the access token lives between launches.
///
/// The access token only. The refresh token is never handed to a client: the
/// server sets it as an httpOnly cookie and reads it back off the request - see
/// auth.controller.js - so it is the cookie jar below that carries it, exactly
/// as the browser does for the React client's `withCredentials: true`.
class TokenStore {
  TokenStore(this._prefs);
  final SharedPreferences _prefs;

  String? get access => _prefs.getString(StorageKeys.accessToken);

  Future<void> set(String access) =>
      _prefs.setString(StorageKeys.accessToken, access);

  Future<void> clear() => _prefs.remove(StorageKeys.accessToken);
}

/// The one HTTP client the app talks through.
///
/// A port of client/src/api/axiosClient.ts, and it keeps the two behaviours
/// that matter:
///
///   envelope   every route answers `{ success, message, data, meta }`, so the
///              payload is unwrapped here and callers get the rows straight.
///   refresh    a 401 on anything but an auth call is retried once behind a
///              single in-flight refresh; queued calls reuse its result. If the
///              refresh itself fails the session is dropped and [onSignedOut]
///              fires, which is what the web client's `manna:signed-out` event
///              did.
///
/// The refresh token travels in a cookie, not in a field this app can see. The
/// [cookies] jar is what stands in for the browser's: it is persisted, so a
/// session survives the app being closed the same way it survives a page
/// reload, and it is cleared on sign-out so the next account does not inherit
/// the last one's refresh cookie.
class ApiClient {
  ApiClient(this.tokens, this.cookies, {required this.log, this.onSignedOut})
    : dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiUrl,
          // Long enough to survive the server waking up.
          //
          // The API is deployed somewhere that sleeps when nobody has called it
          // for a while, and the first call of the morning wears the cold
          // start: measured at a shade under twenty-two seconds, against
          // timeouts that were twenty. That call did not fail on anything that
          // was wrong - it failed on the crew being the first ones in - and
          // what it said was "network unreachable, working offline", which
          // reads as a phone with no signal.
          connectTimeout: const Duration(seconds: 45),
          receiveTimeout: const Duration(seconds: 45),
          sendTimeout: const Duration(seconds: 45),
          headers: {'Content-Type': 'application/json'},
          // Every non-2xx is handled here rather than thrown by Dio, so the
          // envelope's `message` can be read off the body first.
          validateStatus: (_) => true,
        ),
      ) {
    dio.interceptors.add(CookieManager(cookies));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokens.access;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final Dio dio;
  final TokenStore tokens;
  final CookieJar cookies;

  /// Every call is recorded here as it completes - see [RequestLog] for what is
  /// and is not kept.
  final RequestLog log;

  /// Raised when a refresh has finally failed and the session is gone.
  final void Function()? onSignedOut;

  /// One in-flight refresh at a time; queued calls reuse its result.
  Future<String?>? _refreshing;

  Future<String?> _refreshAccessToken() {
    return _refreshing ??= _doRefresh().whenComplete(() {
      _refreshing = null;
    });
  }

  Future<String?> _doRefresh() async {
    try {
      // No body: the refresh cookie is on the jar and the CookieManager puts it
      // on the request. The route also accepts one in the body, but this app
      // has never been given the token to put there.
      final res = await dio.post<dynamic>('/auth/refresh', data: const {});
      if (res.statusCode != null && res.statusCode! >= 400) return null;
      final body = res.data;
      if (body is! Map) return null;
      final data = body['data'];
      if (data is! Map) return null;
      final token = data['accessToken']?.toString();
      if (token == null || token.isEmpty) return null;
      await tokens.set(token);
      return token;
    } catch (_) {
      return null;
    }
  }

  /// The whole request path: send, retry once on a 401, unwrap the envelope.
  Future<Response<dynamic>> _send(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool retried = false,
  }) async {
    // Timed here rather than in an interceptor so the figure covers what the
    // caller actually waited for, retry included.
    final clock = Stopwatch()..start();
    late Response<dynamic> res;
    try {
      res = await dio.request<dynamic>(
        path,
        data: data,
        queryParameters: _clean(query),
        options: Options(method: method),
      );
    } on DioException catch (e) {
      if (e.response != null) {
        res = e.response!;
      } else {
        // Nothing reached the server, so there is no status and no message
        // from it - only what the client was doing when it gave up.
        log.record(
          method: method,
          path: path,
          millis: clock.elapsedMilliseconds,
          message: _reasonFor(e),
        );
        throw const ApiException('Network unreachable — working offline');
      }
    }

    final isAuthCall = path.startsWith('/auth/');
    if (res.statusCode == 401 && !retried && !isAuthCall) {
      final token = await _refreshAccessToken();
      // Recorded either way. A 401 that was quietly refreshed and retried is
      // invisible to the caller and worth seeing in a log - it is what a
      // session dying slowly looks like.
      log.record(
        method: method,
        path: path,
        status: 401,
        millis: clock.elapsedMilliseconds,
        note: token != null ? 'refreshed, retrying' : 'refresh failed',
      );
      if (token != null) {
        return _send(method, path, data: data, query: query, retried: true);
      }
      await tokens.clear();
      onSignedOut?.call();
    }

    final status = res.statusCode ?? 0;
    if (status >= 400) {
      final error = _errorFrom(res);
      log.record(
        method: method,
        path: path,
        status: status,
        millis: clock.elapsedMilliseconds,
        // The server's own words. This is the half worth keeping: every
        // refusal this API makes names where the work actually is.
        message: error.message,
        note: retried ? 'after refresh' : null,
      );
      throw error;
    }

    log.record(
      method: method,
      path: path,
      status: status,
      millis: clock.elapsedMilliseconds,
      note: retried ? 'after refresh' : null,
    );
    return res;
  }

  /// Why a request never landed, in the words to say it in.
  String _reasonFor(DioException e) => switch (e.type) {
    DioExceptionType.connectionTimeout => 'connection timed out',
    DioExceptionType.sendTimeout => 'timed out sending',
    DioExceptionType.receiveTimeout => 'timed out waiting for a reply',
    DioExceptionType.connectionError => 'could not reach the server',
    DioExceptionType.badCertificate => 'the server certificate was refused',
    DioExceptionType.cancel => 'cancelled',
    _ => e.message ?? 'no reply',
  };

  ApiException _errorFrom(Response<dynamic> res) {
    final body = res.data;
    var message = 'Something went wrong';
    var errors = const <FieldError>[];
    if (body is Map) {
      message = body['message']?.toString() ?? message;
      final raw = body['errors'];
      if (raw is List) {
        errors = raw
            .whereType<Map>()
            .map((e) => FieldError.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
    }
    return ApiException(message, status: res.statusCode, errors: errors);
  }

  /// Query parameters with the nulls dropped. An `undefined` in JS simply does
  /// not go on the wire; a Dart null would go as the string "null" and narrow a
  /// list by a value nothing matches.
  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    final out = <String, dynamic>{};
    query.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.isEmpty) return;
      out[k] = v is bool ? (v ? 'true' : 'false') : v;
    });
    return out.isEmpty ? null : out;
  }

  /// Unwraps `{ success, data }` so callers get the payload straight away.
  Future<dynamic> _data(Response<dynamic> res) async {
    final body = res.data;
    if (body is Map && body.containsKey('data')) return body['data'];
    return body;
  }

  // ---- the verbs ------------------------------------------------------

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    required T Function(dynamic data) parse,
  }) async {
    final res = await _send('GET', path, query: query);
    return parse(await _data(res));
  }

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    required T Function(dynamic data) parse,
  }) async {
    final res = await _send('POST', path, data: body ?? const {}, query: query);
    return parse(await _data(res));
  }

  Future<T> patch<T>(
    String path, {
    Object? body,
    required T Function(dynamic data) parse,
  }) async {
    final res = await _send('PATCH', path, data: body ?? const {});
    return parse(await _data(res));
  }

  Future<T> delete<T>(
    String path, {
    required T Function(dynamic data) parse,
  }) async {
    final res = await _send('DELETE', path);
    return parse(await _data(res));
  }

  /// Same as [get], but keeps the pagination meta alongside the rows.
  Future<Paged<T>> getPaged<T>(
    String path, {
    Map<String, dynamic>? query,
    required T Function(Map<String, dynamic> row) parse,
  }) async {
    final res = await _send('GET', path, query: query);
    final body = res.data;
    final data = body is Map ? body['data'] : null;
    final meta = body is Map && body['meta'] is Map
        ? PageMeta.fromJson(Map<String, dynamic>.from(body['meta'] as Map))
        : const PageMeta();
    final rows = data is List
        ? data
              .whereType<Map>()
              .map((r) => parse(Map<String, dynamic>.from(r)))
              .toList()
        : <T>[];
    return Paged<T>(rows, meta);
  }
}

/// `data` as a list of maps, for the routes that answer with a bare array.
List<Map<String, dynamic>> asList(dynamic data) => data is List
    ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
    : const [];

/// `data` as a map, for the routes that answer with one object.
Map<String, dynamic> asMap(dynamic data) =>
    data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
