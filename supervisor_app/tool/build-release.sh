#!/usr/bin/env bash
#
# Build the release APK and refuse to hand over one that points at a machine
# nobody on the floor can reach.
#
#   ./tool/build-release.sh
#
# `flutter build apk --release` on its own does not read .env - the API URL is a
# compile-time constant fed in with --dart-define-from-file, and leaving the flag
# off silently takes AppConfig's fallback instead. That is how a build reached a
# phone pointing at 10.0.2.2:4000, the Android emulator's alias for its host
# machine: it resolves to nothing on real hardware, so every call failed and the
# app reported "network unreachable, working offline" - which reads as a handset
# with no signal rather than as an APK that was never told where the server is.
#
# Nothing about that is visible until somebody opens the app, and by then the
# file has usually been sent on. So this checks the binary it just produced and
# fails loudly if the host is a development one, before the APK can be shared.

set -euo pipefail
cd "$(dirname "$0")/.."

APK=build/app/outputs/flutter-apk/app-release.apk

[ -f .env ] || { echo "no .env - copy .env.example to .env first" >&2; exit 1; }

echo "API_URL for this build: $(grep -E '^API_URL=' .env | cut -d= -f2-)"
flutter build apk --release --dart-define-from-file=.env

# The URL is a string in the AOT snapshot, so read it back out of the shipped
# artefact rather than trusting the flag was honoured.
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
unzip -o -q "$APK" -d "$work" 'lib/arm64-v8a/libapp.so'
so="$work/lib/arm64-v8a/libapp.so"

for bad in '10\.0\.2\.2' 'localhost:[0-9]' '127\.0\.0\.1' '192\.168\.'; do
  if grep -aq "$bad" "$so"; then
    # Delete it. A refusal that leaves the file where the last good build sat is
    # no protection at all - the next person to reach for app-release.apk finds
    # the broken one, and this script's whole purpose is that nobody has to know
    # which build is currently on disk.
    rm -f "$APK"
    echo >&2
    echo "REFUSING: this APK points at a development address ($bad)." >&2
    echo "Deleted $APK so it cannot be sent by mistake." >&2
    echo "Set API_URL in .env to the deployed API, then build again." >&2
    exit 1
  fi
done

grep -aoE 'https://[a-zA-Z0-9._-]+/api/v[0-9]' "$so" | sort -u | sed 's/^/  ships against: /'
echo "OK  $APK  ($(du -h "$APK" | cut -f1))"
