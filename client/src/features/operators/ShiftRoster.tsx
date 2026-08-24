import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { operatorService } from '@/api/services/operator.service';
import { toRequestError } from '@/api/axiosClient';
import { FieldRow, SelectField, TextField } from '@/components/ui';
import { SHIFTS, SIGNER_ROLES } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { currentShift, todayISO } from '@/utils/date';
import type { Operator, Shift, ShiftRosterSlot } from '@/types/models';

/**
 * Who is on each line this shift.
 *
 * It sits on the Machines tab because that is where a shift starts. The
 * supervisor comes on, looks at what is running, and this is the same glance -
 * whereas the Efficiency tab, where it used to live, is opened after the fact by
 * somebody reading how the shift went. A roster filled in on the way out is
 * filled in from memory, and half of it is not filled in at all.
 *
 * The plant pays an incentive on how a line did against its benchmarks, so an
 * unset station is not a blank field, it is a shift's figures belonging to
 * nobody. Hence the panel opens itself while any line is unnamed and folds away
 * once they all are: it asks for exactly as long as there is something to ask.
 *
 * A station is a line, not a machine - the coarse line is two machines worked as
 * one, the autoclaves are a pair one person charges - which is why this is one
 * list of seven rather than a control on each machine card.
 */

export function ShiftRoster() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const role = useAppSelector((s) => s.auth.user?.role);
  const mayAssign = SIGNER_ROLES.includes(role ?? 'worker');

  /*
   * The shift in progress, dated the way a run started now would be dated -
   * todayISO() and currentShift(), the same pair the start sheet opens on. The
   * two have to agree: the efficiency cards join a roster row to a run on the
   * date and the shift, so a roster filed under a different day than the runs
   * it covers would name nobody.
   */
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState<Shift>(currentShift());

  const [people, setPeople] = useState<Operator[]>([]);
  const [roster, setRoster] = useState<ShiftRosterSlot[]>([]);
  const [saving, setSaving] = useState('');
  /** null = decide from the roster; true/false = somebody has said. */
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    operatorService
      .list()
      .then((rows) => live && setPeople(rows))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [refreshTick]);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      setRoster(await operatorService.roster(date, shift));
    } catch {
      // Silent: the roster is not what the crew opened this tab for, and a red
      // box over the machine list would be the wrong size of complaint.
      setRoster([]);
    }
  }, [date, shift]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  /**
   * Put somebody on a line, or take them off it.
   *
   * Saved on the change rather than behind a button. There are seven of these
   * and no draft worth keeping: the answer is a name, and a screen that made the
   * crew press Save seven times would be a screen they stopped filling in.
   */
  const assign = async (station: string, operatorId: string) => {
    setSaving(station);
    try {
      await operatorService.assign({ date, shift, station, operatorId: operatorId || null });
      await load();
    } catch (err) {
      // The server's own words rather than "could not save that": the failure
      // this will actually hit is the operator tables not being there yet, and
      // a crew told only that it did not work has nothing to pass on.
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving('');
    }
  };

  const named = roster.filter((s) => s.operatorId).length;
  const total = roster.length;
  const showing = open ?? named < total;

  // Nothing to show until the roster has been read - and if the API is not
  // there yet (migration 0019), it never will be, so the section stays away
  // rather than sitting empty above the machines.
  if (!roster.length) return null;

  return (
    <section>
      <div className="msec">
        <b>Operators on the lines</b>
        <div className="ln" />
        <button
          type="button"
          className="ct underline underline-offset-4"
          onClick={() => setOpen(!showing)}
          aria-expanded={showing}
        >
          {named} of {total} set · {showing ? 'hide' : 'set'}
        </button>
      </div>

      {showing && (
        <div className="panel">
          {/*
            Which shift is being filled in, and changeable - a night crew that
            came on to find last evening's roster blank can put it right, and
            without this there is no screen anywhere that can.
          */}
          <FieldRow>
            <TextField
              label="Shift date"
              type="date"
              value={date}
              max={todayISO()}
              disabled={!mayAssign}
              onChange={(e) => {
                setDate(e.target.value);
                setOpen(null);
              }}
            />
            <SelectField
              label="Shift"
              value={shift}
              disabled={!mayAssign}
              onChange={(e) => {
                setShift(e.target.value as Shift);
                setOpen(null);
              }}
            >
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectField>
          </FieldRow>

          {roster.map((slot) => (
            <SelectField
              key={slot.station}
              label={slot.label}
              value={slot.operatorId ?? ''}
              disabled={!mayAssign || saving === slot.station}
              onChange={(e) => void assign(slot.station, e.target.value)}
              note={slot.assignedBy ? `— set by ${slot.assignedBy}` : undefined}
            >
              <option value="">— nobody set —</option>
              {people.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              {/*
                The name as it was when the shift was worked, for somebody since
                stood down. Without it the select would fall back to "nobody set"
                and the next change would quietly wipe a recorded assignment.
              */}
              {slot.operatorId && !people.some((o) => o.id === slot.operatorId) && (
                <option value={slot.operatorId}>{slot.operator ?? 'no longer on the list'}</option>
              )}
            </SelectField>
          ))}

          {!people.length && (
            <div className="sub">
              Nobody is on the operator list yet — the office adds them on the Users tab, under
              Operators.
            </div>
          )}
          {!mayAssign && (
            <div className="sub">The supervisor on the shift sets this.</div>
          )}
        </div>
      )}
    </section>
  );
}

export default ShiftRoster;
