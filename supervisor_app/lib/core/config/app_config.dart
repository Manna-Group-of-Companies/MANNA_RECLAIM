/// Single place that reads build-time configuration, so nothing else has to.
///
/// Mirrors client/src/config/env.ts. The API base URL is passed at build time
/// with `--dart-define-from-file=.env`, and falls back to the deployed API.
class AppConfig {
  const AppConfig._();

  /// The Node/Express API this app talks to. Unchanged from the web client:
  /// every route below it is the same one the React app calls.
  ///
  /// The fallback is the deployed API, not a development address, because a
  /// missing define is invisible until the app is in somebody's hands. This
  /// defaulted to `http://10.0.2.2:4000/api/v1` - the Android emulator's alias
  /// for its host machine, on a port nothing serves - and a release APK built
  /// without the define carried it onto a real phone, where 10.0.2.2 addresses
  /// nothing at all. What the crew saw was "network unreachable, working
  /// offline", which reads as a phone with no signal rather than as a build
  /// that was never told where the server is.
  ///
  /// Pointing the fallback at production inverts that: forget the define and
  /// the app still works on the floor, while a developer who wants the local
  /// server says so in .env and gets it. The wrong build is then the one that
  /// is obviously wrong, not the one that is quietly useless.
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://mannareclaim-production.up.railway.app/api/v1',
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
