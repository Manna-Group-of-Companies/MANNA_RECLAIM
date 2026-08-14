/// Signing out when the server will not have it.
///
/// A phone on the plant floor found this one: Settings, Sign out, and the
/// server answered `429 Too many requests, slow down`. The tablet did sign out
/// - the token is dropped whatever the reply is - but the refusal came back up
/// through the button's `onPressed` with nobody to catch it, and landed as an
/// unhandled exception. The screen behind it never got its `maybePop`.
///
/// Every reply below is served by an interceptor, so nothing here goes near the
/// network.
library;

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/api_client.dart';
import 'package:manna_supervisor/core/api/request_log.dart';
import 'package:manna_supervisor/core/config/app_config.dart';
import 'package:manna_supervisor/services/services.dart';
import 'package:manna_supervisor/state/auth_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// A client whose every call is answered [status] without leaving the device.
  Future<ApiClient> clientAnswering(int status, String message) async {
    final prefs = await SharedPreferences.getInstance();
    final api = ApiClient(TokenStore(prefs), CookieJar(), log: RequestLog());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: status,
            data: {'success': false, 'message': message},
          ),
        ),
      ),
    );
    return api;
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({
      'flutter.${StorageKeys.accessToken}': 'a-token',
      'flutter.${StorageKeys.user}': '{"id":1,"name":"Mathai","role":"supervisor"}',
    });
  });

  test('a rate-limited sign-out still signs the tablet out, quietly', () async {
    final api = await clientAnswering(429, 'Too many requests, slow down');
    final auth = AuthService(api);

    await expectLater(auth.logout(), completes);
    expect(api.tokens.access, isNull, reason: 'the token goes either way');
  });

  test('the refusal is kept in the log rather than thrown at the crew', () async {
    // Swallowed is not lost. Settings badges the log with its failures and the
    // server's own sentence is in there, which is the whole reason this is safe
    // to swallow at the button.
    final api = await clientAnswering(429, 'Too many requests, slow down');
    await AuthService(api).logout();

    expect(api.log.failures, 1);
    expect(api.log.entries.first.message, contains('slow down'));
  });

  test('the store ends up signed out, with nothing left behind', () async {
    final prefs = await SharedPreferences.getInstance();
    final api = await clientAnswering(429, 'Too many requests, slow down');
    final auth = AuthStore(AuthService(api), TokenStore(prefs), prefs);
    expect(auth.isAuthed, isTrue);

    await expectLater(auth.logout(), completes);

    expect(auth.isAuthed, isFalse);
    expect(auth.user, isNull);
    expect(prefs.getString(StorageKeys.user), isNull);
    expect(prefs.getString(StorageKeys.accessToken), isNull);
  });

  test('a server that is simply down is no different', () async {
    // 502 off the proxy, the same shape: the tablet is not held signed in by a
    // server that cannot answer.
    final prefs = await SharedPreferences.getInstance();
    final api = await clientAnswering(502, 'Bad gateway');
    final auth = AuthStore(AuthService(api), TokenStore(prefs), prefs);

    await expectLater(auth.logout(), completes);
    expect(auth.isAuthed, isFalse);
  });
}
