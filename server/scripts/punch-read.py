"""
Read the gate punch reader onto disk. Read only.

    python scripts/punch-read.py                 -> the last 3 days
    python scripts/punch-read.py --days 1200     -> everything the device holds
    python scripts/punch-read.py --out punches.json

Writes a JSON file that scripts/punch-import.js loads through the same service
the live sync posts to, so what is imported by hand and what arrives by itself
are the same rows built the same way.

READ ONLY, and one thing in particular. This deliberately does NOT call
`disable_device()`, which nearly every pyzk example opens with: it makes the
reader refuse fingerprints while the session is open, and a script that dies
before `enable_device()` leaves the gate shut with a shift changing outside it.
Nothing here enrols, deletes, clears the log, sets the clock, restarts or
unlocks. The log on that device is the plant's attendance record and there is no
second copy of it.

Needs `pip install pyzk`.
"""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path

from zk import ZK

# The device records which way through the gate, which is what decides the shift
# a punch belongs to - see attendance.service. 0 is in, 1 is out, confirmed off
# 79,250 records: the two values split almost exactly in half, and the ins peak
# in the hour before each shift starts while the outs peak in the hour after.
DIRECTION = {0: "in", 1: "out"}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ip", default="192.168.1.40")
    ap.add_argument("--port", type=int, default=4370)
    ap.add_argument("--password", type=int, default=0)
    ap.add_argument("--days", type=int, default=3, help="How far back to take.")
    ap.add_argument("--out", default=str(Path(__file__).parent / "punches.json"))
    args = ap.parse_args()

    since = date.today() - timedelta(days=args.days)
    conn = None
    zk = ZK(args.ip, port=args.port, timeout=20, password=args.password, ommit_ping=True)
    try:
        conn = zk.connect()
        print(f"{conn.get_device_name()} · {conn.get_firmware_version()} · "
              f"clock {conn.get_time()}")

        users = {u.user_id: (u.name or "").strip() for u in conn.get_users()}
        print(f"{len(users)} users enrolled")

        rows = []
        for a in conn.get_attendance():
            if a.timestamp.date() < since:
                continue
            rows.append({
                "code": str(a.user_id),
                "name": users.get(a.user_id) or None,
                "date": a.timestamp.strftime("%Y-%m-%d"),
                "time": a.timestamp.strftime("%H:%M:%S"),
                "direction": DIRECTION.get(a.punch),
            })
        rows.sort(key=lambda r: (r["date"], r["time"]))

        payload = {
            "device": f"K90+ID {args.ip}",
            "asOf": conn.get_time().isoformat(),
            "punches": rows,
        }
        Path(args.out).write_text(json.dumps(payload, indent=1), encoding="utf-8")
        span = f"{rows[0]['date']} to {rows[-1]['date']}" if rows else "nothing in range"
        print(f"{len(rows)} punches ({span}) -> {args.out}")
    finally:
        if conn:
            conn.disconnect()


if __name__ == "__main__":
    main()
