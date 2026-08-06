/// What the diagnostic log keeps, and what it must never keep.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/request_log.dart';

void main() {
  group('what it records', () {
    test('newest first, because that is how a log is read', () {
      final log = RequestLog()
        ..record(method: 'get', path: '/runs/active', status: 200, millis: 12)
        ..record(method: 'post', path: '/runs/start', status: 201, millis: 40);

      expect(log.entries.first.path, '/runs/start');
      expect(log.entries.last.path, '/runs/active');
    });

    test('the method is normalised, so the column lines up', () {
      final log = RequestLog()
        ..record(method: 'patch', path: '/runs/1', status: 200, millis: 5);
      expect(log.entries.first.method, 'PATCH');
    });

    test("a refusal keeps the server's own words", () {
      // The useful half. "409" is not something anybody can act on; the
      // sentence beside it names the group and what is wrong with it.
      final log = RequestLog()
        ..record(
          method: 'post',
          path: '/dispatches',
          status: 409,
          millis: 88,
          message: 'B1041-Fine has only 12 sacks left.',
        );

      final entry = log.entries.first;
      expect(entry.failed, isTrue);
      expect(entry.unreachable, isFalse);
      expect(entry.message, contains('12 sacks'));
    });

    test('a call that never landed has no status, and says so', () {
      final log = RequestLog()
        ..record(
          method: 'get',
          path: '/stock/summary',
          millis: 20000,
          message: 'could not reach the server',
        );

      final entry = log.entries.first;
      expect(entry.status, isNull);
      expect(entry.unreachable, isTrue);
      expect(entry.failed, isTrue);
      expect(entry.line, contains('ERR'));
    });

    test('failures are counted for the badge on Settings', () {
      final log = RequestLog()
        ..record(method: 'get', path: '/a', status: 200, millis: 1)
        ..record(method: 'get', path: '/b', status: 500, millis: 1)
        ..record(method: 'get', path: '/c', millis: 1);

      expect(log.length, 3);
      expect(log.failures, 2);
    });
  });

  group('what it must not keep', () {
    test('a query string is dropped rather than trimmed', () {
      // Nothing this app sends puts a secret in a query today, and a log is the
      // wrong place to be relying on that staying true.
      final log = RequestLog()
        ..record(
          method: 'get',
          path: '/runs?all=1&token=shouldnotbehere',
          status: 200,
          millis: 9,
        );

      expect(log.entries.first.path, '/runs');
      expect(log.asText(), isNot(contains('shouldnotbehere')));
    });

    test('the sign-in PIN cannot reach it, because bodies never do', () {
      // record() takes no body and no headers - there is no parameter a PIN or
      // a bearer token could arrive through. This pins that shape: if somebody
      // later adds one, this test is where it gets noticed.
      final log = RequestLog()
        ..record(method: 'post', path: '/auth/login', status: 200, millis: 60);

      final text = log.asText(account: 'Mathai', role: 'supervisor');
      expect(text, contains('/auth/login'));
      expect(text, isNot(contains('pin')));
      expect(text, isNot(contains('Bearer')));
    });
  });

  group('it does not grow without bound', () {
    test('the oldest fall off once it is full', () {
      final log = RequestLog();
      for (var i = 0; i < RequestLog.capacity + 50; i++) {
        log.record(method: 'get', path: '/call/$i', status: 200, millis: 1);
      }

      expect(log.length, RequestLog.capacity);
      // The newest is kept and the first fifty are gone.
      expect(log.entries.first.path, '/call/${RequestLog.capacity + 49}');
      expect(log.entries.last.path, '/call/50');
    });

    test('clearing empties it', () {
      final log = RequestLog()
        ..record(method: 'get', path: '/a', status: 200, millis: 1)
        ..clear();
      expect(log.length, 0);
    });
  });

  test('the copied text says what it is and what it talked to', () {
    final log = RequestLog()
      ..record(method: 'get', path: '/runs/active', status: 200, millis: 12);

    final text = log.asText(account: 'Mathai', role: 'supervisor');
    expect(text, contains('Manna Supervisor'));
    expect(text, contains('Mathai'));
    expect(text, contains('supervisor'));
    expect(text, contains('/runs/active'));
  });
}
