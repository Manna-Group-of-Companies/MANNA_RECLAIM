import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/config/constants.dart';
import '../core/models/models.dart';
import '../services/services.dart';

enum AuthStatus { idle, loading, authenticated, error }

/// Who is signed in, and what they are allowed to do.
///
/// A port of client/src/features/auth/authSlice.ts, including the rule that
/// makes the guards behave: a cached user is only trusted when there is still
/// an access token beside it. A user without a token is not a session, and
/// treating it as one is how an app ends up with the login screen and the guard
/// bouncing the user between them.
class AuthStore extends ChangeNotifier {
  AuthStore(this._auth, this._tokens, this._prefs) {
    _user = _cached();
    _status = (_tokens.access?.isNotEmpty ?? false)
        ? AuthStatus.authenticated
        : AuthStatus.idle;
  }

  final AuthService _auth;
  final TokenStore _tokens;
  final SharedPreferences _prefs;

  User? _user;
  AuthStatus _status = AuthStatus.idle;
  String? _error;

  User? get user => _user;
  AuthStatus get status => _status;
  String? get error => _error;
  bool get isAuthed => _status == AuthStatus.authenticated && _user != null;

  String? get role => _user?.role;

  /// Who this app is for, and it is the same list the routes it replaces used.
  ///
  /// [floorRoles] - worker, supervisor, manager and admin - because that is
  /// exactly who the React site let onto these pages, and a migration that
  /// quietly narrowed it would take the tablets off the crews on the day it
  /// shipped. What has changed is what is *in* the app: Quality is not here,
  /// and a lab account is turned away at the door rather than let in to a shell
  /// with nothing in it that is theirs.
  ///
  /// Every finer permission still applies inside - see [mayDelete],
  /// [mayDispatch], [mayUnpack] and [isManager] - and each of them mirrors a
  /// gate the server enforces.
  bool get mayUseThisApp => role != null && floorRoles.contains(role);

  /// Whether this account may clear a weighing, or clear an emptied yard group.
  /// The admin account and nobody else - see [deleteRoles]. Mirrored from the
  /// server so no screen offers a tap that comes back 403.
  bool get mayDelete => role != null && deleteRoles.contains(role);

  /// The back office: the ledger reads and the QC verdict.
  bool get isManager => role != null && adminRoles.contains(role);

  /// Who may raise a dispatch, and therefore who is shown the customer list.
  bool get mayDispatch => role != null && dispatchRoles.contains(role);

  /// Whether this account may undo a packing. `DELETE /runs/:id/pack` is
  /// adminOnly, so the button is not drawn for the crew - nothing is taken away
  /// by that, because re-entering the packed figure is a correction and that is
  /// still theirs.
  bool get mayUnpack => isManager;

  User? _cached() {
    if (_tokens.access?.isEmpty ?? true) {
      _prefs.remove(StorageKeys.user);
      return null;
    }
    final raw = _prefs.getString(StorageKeys.user);
    if (raw == null) return null;
    try {
      return User.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> _remember(User user) async {
    _user = user;
    _status = AuthStatus.authenticated;
    _error = null;
    await _prefs.setString(StorageKeys.user, jsonEncode(user.toJson()));
    notifyListeners();
  }

  Future<bool> login(String name, String pin) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();
    try {
      final session = await _auth.login(name: name.trim(), pin: pin);
      // Refused at the door rather than at every tab. The lab's work is the
      // Quality module and that is on the Manna website; letting a lab account
      // in here would be letting it into a shell with nothing in it that is
      // theirs, and every tab refusing it one at a time.
      if (!floorRoles.contains(session.user.role)) {
        await _auth.logout();
        _status = AuthStatus.error;
        _error = session.user.role == Roles.lab
            ? 'Quality is on the Manna website — sign in there to record tests.'
            : 'This account has no access to the Supervisor app.';
        _user = null;
        notifyListeners();
        return false;
      }
      await _remember(session.user);
      return true;
    } on ApiException catch (e) {
      _status = AuthStatus.error;
      _error = e.message;
      notifyListeners();
      return false;
    }
  }

  /// Re-reads the session behind a token this device already had.
  Future<void> loadSession() async {
    if (_tokens.access?.isEmpty ?? true) return;
    try {
      await _remember(await _auth.me());
    } on ApiException {
      await _signedOut();
    }
  }

  Future<void> logout() async {
    // Both outcomes sign out. The service drops the token whatever the server
    // says, so leaving the user in place when the call fails would leave the
    // app half signed in: no token, but a user the guards still see.
    try {
      await _auth.logout();
    } finally {
      await _signedOut();
    }
  }

  /// Fired by the api client when a refresh has finally failed.
  Future<void> sessionExpired() => _signedOut();

  Future<void> _signedOut() async {
    _user = null;
    _status = AuthStatus.idle;
    _error = null;
    await _prefs.remove(StorageKeys.user);
    await _tokens.clear();
    notifyListeners();
  }

  void clearError() {
    if (_error == null) return;
    _error = null;
    if (_status == AuthStatus.error) _status = AuthStatus.idle;
    notifyListeners();
  }
}
