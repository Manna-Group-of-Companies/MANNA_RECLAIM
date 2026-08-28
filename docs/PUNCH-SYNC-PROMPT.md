# Prompt for the Claude on the plant server — the gate punch reader

Paste everything below the line into Claude Code **on the plant server computer**
(the same machine that runs the SAP syncs). It cannot be run from anywhere else:
the reader is on the plant LAN and nothing outside the building can reach it.

---

Write me a Python script that reads the attendance punches off the biometric
reader on this LAN and posts them to the MANNA RECLAIM API.

## The device

- **Brand / model:** Identix K90+ID
- **IP address:** `192.168.1.40`
- **Where it is:** the gate. Everybody who comes into the plant punches on it —
  production workers, the office, drivers, management.

I do not know what protocol it speaks. Most Indian-market fingerprint readers of
this class are ZKTeco-protocol compatible on **TCP/UDP port 4370**, and the
`pyzk` library (`pip install pyzk`) talks to them, so try that first. Do not
assume it: check what actually answers before writing the whole script around a
guess.

Work it out in this order and tell me what you find:

1. Is it up — `ping 192.168.1.40`.
2. What is open — try 4370 first, then 80 and 8000. Some of these devices also
   serve a small web page that names the firmware, which settles the protocol
   faster than anything else.
3. If 4370 answers, try `pyzk`: connect, read the device name and firmware, read
   the user list, read the attendance log.
4. If it is not ZK-protocol, say so and tell me what it looks like instead
   rather than guessing at a library. There is a real chance this needs the
   vendor's SDK, and I would rather know that than have a script that half works.

**Read only. This is important.** `pyzk` and every SDK like it can enrol users,
change the clock, and — the dangerous one — **clear the attendance log**
(`clear_attendance()`). The log on that device is the plant's attendance record
and there is no copy of it anywhere else yet. Nothing in this task needs a write
of any kind, so a write is a bug however it got there. Do not call anything that
enrols, deletes, clears, restarts or sets the time, and do not include such a
call "for later, commented out".

Also: do not disable or unlock the device, and do not leave a connection open.
Some of these readers refuse fingerprints while a management session is
connected, which would lock the crew out at shift change. Connect, read,
disconnect, in a `finally`.

## What to send

`POST https://manna-reclaim.onrender.com/api/v1/sync/attendance`

Headers:

```
Authorization: Bearer <SAP_SYNC_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "device": "K90+ID 192.168.1.40",
  "asOf": "2026-08-28T09:12:00+05:30",
  "punches": [
    { "code": "104", "name": "Suresh", "date": "2026-08-28", "time": "08:41", "direction": "in" },
    { "code": "108", "name": "Mathai", "date": "2026-08-28", "time": "08:44" }
  ]
}
```

Field by field:

- `code` — the device's own user id, as a string. This is the join. The app
  matches it against the punch code on its operator roster, and that match is the
  whole definition of "this punch is a production worker". Send it exactly as the
  device holds it: do not strip leading zeros, do not cast to int and back.
- `name` — the name as enrolled on the device. Optional, and only used until
  somebody is on the roster; after that the app's own spelling wins. Send it
  anyway: it is what lets a supervisor recognise a new hand.
- `date` and `time` — **the device's own local clock, as it reads it.** Not UTC,
  not converted, no offset. `time` may be `HH:MM` or `HH:MM:SS`.
- `direction` — `"in"` or `"out"` if the device records one. Omit it entirely if
  it does not. Do not invent it by guessing from the order of punches.

### Why the local clock, specifically

The API runs on a rack outside India and the plant's night shift runs 20:30 to
08:30, filed under the date it began. The server works out which shift a punch
belongs to from the local date and time you send. Convert to UTC first and every
punch between midnight and 08:30 IST — which is most of the night crew signing
out — lands on the wrong shift of the wrong day, and it will look perfectly
normal on screen. So send what the device's display would show and let the
server do the rest.

## The window to send

Send **the last 3 days** on every run, not just what is new.

You do not need to track what was already sent, and should not try. The API
de-duplicates on (device, code, punch time): re-sending is free and stores
nothing the second time. The response tells you what actually landed:

```json
{
  "success": true,
  "data": { "device": "...", "received": 220, "stored": 14, "already": 206,
            "from": "2026-08-26", "to": "2026-08-28" }
}
```

Log `stored` and `already` on every run. A run where `received` is high and
`stored` is 0 all day is normal. A run where `received` is 0 means the device
gave us nothing, which is the failure worth an alert.

## Config, not code

Read the settings from `punch.json` beside the script, in the same style as the
SAP `target.json`:

```json
{
  "device": { "ip": "192.168.1.40", "port": 4370, "password": 0 },
  "api": { "url": "https://manna-reclaim.onrender.com/api/v1/sync/attendance",
           "token": "" }
}
```

**Leave `token` empty in the file you write and in anything you print.** I will
paste the real value in myself.

It is the **same token the SAP syncs already use** — the one in `target.json`
beside this script, and `SAP_SYNC_TOKEN` in the API's environment. There is
nothing new to create. One shared secret opens all three sync routes, which is a
deliberate trade: a separate token would be tidier isolation, and it would also
be a second value to rotate and a second Render environment variable to get
wrong. What is behind the token either way is the ability to file a punch or a
stock figure that did not happen — which somebody would see on the screen the
next morning — and nothing that reads the plant's commercial record. Ask me if
you would rather have a second one and I will set it up.

Nothing that has been through a chat window is a secret any more, so generate
nothing and copy nothing out of this prompt.

Some of these readers have a comms password (often 0). Put it in the config
rather than in the script.

## Running it

Every **15 minutes**. The board is read at the start of a shift, so a punch that
takes an hour to arrive is a worker the supervisor cannot place.

Set it up as a Windows scheduled task the same way as the SAP syncs. If
registering the task is blocked in your environment — it was last time, and that
block is correct, since a task running as SYSTEM whether or not anybody is logged
on is a persistent change to somebody else's machine — **do not work around it**.
Print the exact `schtasks` command for me to run in an Administrator prompt, and
say so plainly.

## Tell me afterwards

1. What the device actually is: protocol, firmware, how many users enrolled, how
   far back the log goes.
2. How many punches came back for the last 3 days, and the `stored` / `already`
   counts from the API.
3. **The user list — codes and names.** I need this to match the codes to the
   roster in the app. A table is fine; do not post it anywhere, just show me.
4. Anything odd: users with no name, duplicate codes, a device clock that
   disagrees with the wall clock. That last one matters more than it sounds —
   the shift a punch lands in is decided by the device's clock, so a reader
   running twenty minutes fast puts the 08:25 crowd on the wrong shift.
