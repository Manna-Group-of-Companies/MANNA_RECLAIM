import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config/app_config.dart';
import '../core/config/constants.dart';

enum ToastKind { ok, err, warn }

class Toast {
  const Toast(this.id, this.message, this.kind);
  final int id;
  final String message;
  final ToastKind kind;
}

/// The ui slice: toasts, connectivity, the refresh signal, and who is signing.
/// A port of client/src/features/ui/uiSlice.ts.
class UiStore extends ChangeNotifier {
  UiStore(this._prefs, {String? accountName})
    : _supervisor = _prefs.getString(StorageKeys.supervisor),
      _supervisorFor = _prefs.getString(StorageKeys.supervisorFor),
      _account = accountName ?? '',
      _signers =
          _prefs.getStringList(StorageKeys.signers) ?? const <String>[];

  final SharedPreferences _prefs;

  final List<Toast> _toasts = [];
  List<Toast> get toasts => List.unmodifiable(_toasts);
  int _nextToastId = 0;

  bool _online = true;
  bool get online => _online;

  /// Bumped by any write whose effect is mostly on another screen. Pages watch
  /// it and re-run whatever they fetch, so one signal re-reads the app without
  /// the writer needing to know which screens were listening.
  ///
  /// Two writes in this app raise it: unpacking a run (sacks come off a stock
  /// group, and the group goes entirely when that run was the only thing in it)
  /// and deleting one in History (which does the same, and takes the lab's
  /// tests with it).
  int _refreshTick = 0;
  int get refreshTick => _refreshTick;

  /// The supervisor the tablet is signing records with, once someone has
  /// switched it. Null means nobody has, and the signed-in account's own name
  /// stands. Persisted, because the tablet gets reloaded mid-shift and
  /// re-picking would be the crew's job to remember.
  String? _supervisor;

  /// The account that made that pick, and the reason the pick is not simply
  /// trusted: it is remembered for the *tablet*, and a tablet outlives a
  /// session. A name switched on one shift went on signing every record after
  /// it - through a sign-out, through the next person signing in as themselves
  /// - so History read back a supervisor who had not been near the machine.
  ///
  /// Null on a tablet that picked before this was recorded, which is read as
  /// "belongs to nobody" and ignored - once, on the next start.
  String? _supervisorFor;
  String _account;

  /// The pick, but only while it is still this account's. Anything else - a
  /// name switched by whoever was signed in before, or one from before owners
  /// were recorded - is not this session's and does not sign its records.
  String? get _chosen {
    final chosen = _supervisor;
    if (chosen == null || chosen.isEmpty) return null;
    final owner = _supervisorFor;
    if (owner == null || owner.isEmpty || owner != _account) return null;
    return chosen;
  }

  /// Who the plant's accounts say may sign a record, last read from the server.
  ///
  /// Empty until this device has read them once, and the compiled-in
  /// [supervisorNames] stand in until it has. Persisted rather than re-fetched
  /// per sheet: the list changes a few times a year, and a tablet that opens a
  /// sheet with no signal still needs a pick that works.
  List<String> _signers;

  /// Who the record is signed by.
  ///
  /// The account signed in is the default, because on most shifts it is the
  /// same person. It is not the answer though: a tablet is left on the line
  /// signed in once, and the supervisor who actually loaded the autoclave or
  /// took the bearing temperatures is whoever is holding it.
  String get supervisorName {
    final chosen = _chosen;
    if (chosen != null) return chosen;
    if (_account.isNotEmpty) return _account;
    return supervisorOptions.isNotEmpty ? supervisorOptions.first : '';
  }

  /// Who is signed in on this tablet, whatever the records are being signed
  /// with. Empty before anyone is.
  String get accountName => _account;

  /// True while the name is the account's own, so a sheet can say "you".
  bool get supervisorIsAccount => _chosen == null || _chosen == _account;

  /// The account first - it is the default - then the plant's supervisors.
  List<String> get supervisorOptions {
    final plant = _signers.isEmpty ? supervisorNames : _signers;
    final seen = <String>{};
    for (final name in [_account, ...plant, _chosen ?? '']) {
      if (name.isNotEmpty) seen.add(name);
    }
    return seen.toList();
  }

  /// The names that may sign, as the server has them.
  ///
  /// An empty answer is ignored: a plant with no supervisors on it is a bad
  /// read, not a reason to leave the crew a pick with nothing in it. The name
  /// already chosen is left alone even if it is no longer on the list - it is
  /// what this tablet has been signing the shift with, and dropping it mid-shift
  /// would silently re-sign the next record as somebody else.
  Future<void> setSigners(List<String> names) async {
    final clean = [
      for (final name in names)
        if (name.trim().isNotEmpty) name.trim(),
    ];
    if (clean.isEmpty || listEquals(clean, _signers)) return;
    _signers = clean;
    await _prefs.setStringList(StorageKeys.signers, clean);
    notifyListeners();
  }

  void setAccountName(String name) {
    if (_account == name) return;
    _account = name;
    notifyListeners();
  }

  /// Switch who is signing. Blank hands the record back to the account.
  ///
  /// The account doing the switching is stored with the choice, so the choice
  /// is dropped when somebody else signs in rather than inherited by them - see
  /// [_supervisorFor].
  Future<void> setSupervisor(String value) async {
    final name = value.trim();
    _supervisor = name.isEmpty ? null : name;
    _supervisorFor = _supervisor == null || _account.isEmpty ? null : _account;
    if (_supervisor == null) {
      await _prefs.remove(StorageKeys.supervisor);
    } else {
      await _prefs.setString(StorageKeys.supervisor, _supervisor!);
    }
    if (_supervisorFor == null) {
      await _prefs.remove(StorageKeys.supervisorFor);
    } else {
      await _prefs.setString(StorageKeys.supervisorFor, _supervisorFor!);
    }
    notifyListeners();
  }

  void notify(String message, [ToastKind kind = ToastKind.ok]) {
    final toast = Toast(_nextToastId++, message, kind);
    _toasts.add(toast);
    notifyListeners();
    Future.delayed(const Duration(milliseconds: 3200), () => dismiss(toast.id));
  }

  void dismiss(int id) {
    final before = _toasts.length;
    _toasts.removeWhere((t) => t.id == id);
    if (_toasts.length != before) notifyListeners();
  }

  void setOnline(bool value) {
    if (_online == value) return;
    _online = value;
    notifyListeners();
  }

  void requestRefresh() {
    _refreshTick += 1;
    notifyListeners();
  }
}
