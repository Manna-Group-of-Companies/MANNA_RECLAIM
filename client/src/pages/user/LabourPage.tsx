import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pick, PickGrid, SheetLabel, EmptyState, Modal, TextField, Button } from '@/components/ui';
import { useAppSelector } from '@/app/hooks';
import { attendanceService } from '@/api/services/attendance.service';
import { toRequestError } from '@/api/axiosClient';
import { useToast } from '@/hooks/useToast';
import { todayISO, currentShift, dayLong } from '@/utils/date';
import { SHIFTS } from '@/config/constants';
import { cn } from '@/utils/cn';
import type { LabourBoard, LabourPerson, Shift } from '@/types/models';

/**
 * Who came in, and where they are working.
 *
 * Every labour figure in this app rests on a number the supervisor types from
 * memory at the end of a pass - `workers`, usually 3. Kilograms per man-hour,
 * the incentive, the batch comparison: all of it is that number times the hours,
 * and nobody has been able to check it against who actually walked through the
 * gate.
 *
 * The gate is a punch reader on the plant LAN. It knows who came in and knows
 * nothing else - it punches the office and the drivers exactly as it punches a
 * refiner hand, and it has no idea that a shift is a thing or that a grinder
 * needs two people on it. So this screen is where the two halves meet: the
 * reader says who is here, and the supervisor says where they went.
 *
 * PICK A PERSON, THEN A PLACE. Two taps, and the second one is a big tile,
 * because this is done at the start of a shift by somebody in gloves standing
 * next to a machine. A dropdown per person would be eleven dropdowns and a
 * drag-and-drop would be unusable on a tablet held in one hand.
 */

/** The stations a person can be put on, drawn as tiles. */
function StationBoard({
  board,
  picked,
  onPlace,
  onLift,
  busy,
}: {
  board: LabourBoard;
  picked: LabourPerson | null;
  onPlace: (station: string) => void;
  onLift: (person: LabourPerson) => void;
  busy: boolean;
}) {
  return (
    <>
      {board.stations.map((station) => (
        <div key={station.key} className="stationbox">
          <button
            type="button"
            disabled={!picked || busy}
            onClick={() => onPlace(station.key)}
            className={cn('stationhead', picked && !busy && 'open')}
          >
            <b>{station.label}</b>
            <small>
              {station.people.length
                ? `${station.people.length} on it`
                : picked
                  ? 'tap to put them here'
                  : 'nobody'}
            </small>
          </button>
          {station.people.length > 0 && (
            <div className="stationcrew">
              {station.people.map((person) => (
                <button
                  key={person.code}
                  type="button"
                  disabled={busy}
                  className="crewchip"
                  onClick={() => onLift(person)}
                >
                  {person.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function LabourPage() {
  const notify = useToast();
  const user = useAppSelector((s) => s.auth.user);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const canAssign = user?.role !== 'worker';

  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState<Shift>(currentShift());
  const [board, setBoard] = useState<LabourBoard | null>(null);
  const [picked, setPicked] = useState<LabourPerson | null>(null);
  const [claiming, setClaiming] = useState<LabourPerson | null>(null);
  const [claimName, setClaimName] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBoard(await attendanceService.forShift({ date, shift }));
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [date, shift]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  // The pick does not survive a change of shift: the person highlighted was on
  // yesterday's board and putting them on a machine today is not what the tap
  // meant.
  useEffect(() => setPicked(null), [date, shift]);

  const unassigned = useMemo(
    () => (board?.people ?? []).filter((p) => !p.station),
    [board],
  );

  const place = async (station: string | null, person = picked) => {
    if (!person) return;
    setBusy(true);
    try {
      await attendanceService.assign({ date, shift, code: person.code, station });
      setPicked(null);
      await load();
      notify(
        station
          ? `${person.name} → ${board?.stations.find((s) => s.key === station)?.label ?? station}`
          : `${person.name} taken off`,
        'ok',
      );
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!claiming || !claimName.trim()) return;
    setBusy(true);
    try {
      await attendanceService.claim({ code: claiming.code, name: claimName.trim() });
      setClaiming(null);
      setClaimName('');
      await load();
      notify('Added to the floor roster', 'ok');
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="sheet">
        <EmptyState title="The board could not be read" hint={error} />
      </div>
    );
  }

  return (
    <>
      <div className="sheet">
        <SheetLabel>Shift</SheetLabel>
        <div className="fieldrow">
          <input
            type="date"
            className="fld"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className="chips">
            {SHIFTS.map((s) => (
              <button
                key={s}
                type="button"
                className={cn('chip', shift === s && 'on')}
                onClick={() => setShift(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {board && (
          <div className="tallies mt-3">
            <div className="tally">
              <b>{board.summary.onFloor}</b>
              <small>on the floor</small>
            </div>
            <div className="tally">
              <b>{board.summary.assigned}</b>
              <small>placed</small>
            </div>
            <div className={cn('tally', board.summary.unassigned > 0 && 'warn')}>
              <b>{board.summary.unassigned}</b>
              <small>still to place</small>
            </div>
          </div>
        )}
      </div>

      {loading && !board && <div className="sheet muted">Reading the gate…</div>}

      {/*
        Nothing from the reader at all.

        Said plainly rather than drawn as an empty board, because the two look
        identical and mean opposite things: a shift where nobody came in, and a
        reader that has not sent anything. The second is the one that will be
        true on the first day and the fix is not on this screen.
      */}
      {board && board.summary.punchedIn === 0 && (
        <div className="sheet">
          <EmptyState
            title="No punches for this shift"
            hint={
              `Either nobody has punched in yet, or the reader on the plant server has not sent `
              + `this shift up. The board fills itself from the gate — nothing here is typed by hand.`
            }
          />
        </div>
      )}

      {board && board.summary.punchedIn > 0 && (
        <>
          <div className="sheet">
            <SheetLabel>
              Came in, not placed yet{' '}
              {picked && (
                <span className="muted normal-case tracking-normal">
                  — {picked.name} is picked, now tap where they are working
                </span>
              )}
            </SheetLabel>
            {unassigned.length === 0 ? (
              <div className="hint">Everybody who came in has somewhere to be.</div>
            ) : (
              <PickGrid>
                {unassigned.map((person) => (
                  <Pick
                    key={person.code}
                    title={person.name}
                    sub={`in at ${person.firstAt ?? '—'}`}
                    selected={picked?.code === person.code}
                    onClick={() =>
                      setPicked(picked?.code === person.code ? null : person)}
                  />
                ))}
              </PickGrid>
            )}
          </div>

          <div className="sheet">
            <SheetLabel>
              Where they are working{' '}
              <span className="muted normal-case tracking-normal">
                — tap a name to move them
              </span>
            </SheetLabel>
            <StationBoard
              board={board}
              picked={canAssign ? picked : null}
              busy={busy}
              onPlace={(station) => void place(station)}
              onLift={(person) => (canAssign ? void place(null, person) : undefined)}
            />
          </div>

          {/*
            The gate meets a new hand before this app does, every time. Left as a
            trip to the back office that means in practice the shift is worked
            and never recorded, so the supervisor names them here and the roster
            grows out of the punches that actually happen.
          */}
          {board.offRoster.length > 0 && (
            <div className="sheet">
              <SheetLabel>
                Punched in, not on the floor roster{' '}
                <span className="muted normal-case tracking-normal">
                  — the office, the drivers, and anybody new
                </span>
              </SheetLabel>
              <PickGrid>
                {board.offRoster.map((person) => (
                  <Pick
                    key={person.code}
                    title={person.name}
                    sub={`${person.code} · in at ${person.firstAt ?? '—'}`}
                    onClick={() => {
                      if (!canAssign) return;
                      setClaiming(person);
                      setClaimName(person.deviceName ?? '');
                    }}
                  />
                ))}
              </PickGrid>
              <div className="hint mt-2">
                These are not counted on the floor. Tap one if they are ours and it will go on
                the roster under the name you give it.
              </div>
            </div>
          )}

          {board.stray.length > 0 && (
            <div className="sheet">
              <SheetLabel>Placed somewhere that is no longer a station</SheetLabel>
              <PickGrid>
                {board.stray.map((person) => (
                  <Pick
                    key={person.code}
                    title={person.name}
                    sub={person.station ?? ''}
                    onClick={() => (canAssign ? void place(null, person) : undefined)}
                  />
                ))}
              </PickGrid>
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(claiming)}
        title="One of ours?"
        onClose={() => setClaiming(null)}
      >
        <div className="hint">
          {claiming?.code} punched in at {claiming?.firstAt}
          {claiming?.deviceName ? `, and the gate calls them ${claiming.deviceName}` : ''}. Naming
          them here puts them on the floor roster, so they appear on this board from now on and can
          be placed on a machine.
        </div>
        <TextField
          label="Name"
          value={claimName}
          onChange={(e) => setClaimName(e.target.value)}
          placeholder="As the plant knows them"
        />
        <Button onClick={() => void claim()} disabled={!claimName.trim() || busy}>
          Add to the floor roster
        </Button>
      </Modal>

      {board && (
        <div className="sheet muted text-xs">
          {dayLong(date)} · {shift} shift · {board.summary.punchedIn} punched in,
          {' '}{board.summary.offRoster} of them not floor.
        </div>
      )}
    </>
  );
}

export default LabourPage;
