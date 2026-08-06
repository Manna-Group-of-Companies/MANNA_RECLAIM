/// Single place that reads build-time configuration, so nothing else has to.
///
/// Mirrors client/src/config/env.ts. The API base URL is passed with
/// `--dart-define=API_URL=...` at build time and defaults to the same
/// development address the React client falls back to.
class AppConfig {
  const AppConfig._();

  /// The Node/Express API this app talks to. Unchanged from the web client:
  /// every route below it is the same one the React app calls.
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );

  static const String appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'Manna Production Management',
  );

  /// How often the yard re-reads itself while somebody is looking at it.
  /// The lab and the yard are different accounts on different devices, so a
  /// verdict filed at the bench can only reach this one by polling.
  static const Duration yardPoll = Duration(seconds: 30);
}

/// Keys under which the device remembers things between launches.
/// Same names as the web client's localStorage keys, deliberately: the two
/// apps are the same product and a support call should not have to ask which.
class StorageKeys {
  const StorageKeys._();

  static const accessToken = 'manna.accessToken';
  static const refreshToken = 'manna.refreshToken';
  static const user = 'manna.user';
  static const offlineQueue = 'manna.offlineQueue';

  /// The name the tablet is signing records with - see SupervisorName.
  static const supervisor = 'manna.supervisor';
}
