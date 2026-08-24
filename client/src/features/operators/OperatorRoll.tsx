import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { operatorService } from '@/api/services/operator.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import type { Operator, OperatorStation } from '@/types/models';

/**
 * The plant's roll of operators - who runs the lines.
 *
 * Kept here rather than on the tablet, and that is the whole reason the roll
 * exists. Typed by hand at the start of each shift, "Suresh", "suresh" and
 * "Sursh" are three people, an incentive total is wrong by a third, and nobody
 * spots it because each one looks right on its own screen. Written down once by
 * the office, the same person is the same row every shift.
 *
 * It sits under the accounts because the page's question is who works here. The
 * difference between the two lists is a login: an operator does not sign into
 * anything - the tablet belongs to the supervisor - so an operator has a name
 * and no PIN, and adding one hands out no access to anything.
 *
 * Standing somebody down rather than deleting them, as the machine list and the
 * accounts both do: the shifts already recorded against a name are part of the
 * plant's record, and a name that vanishes takes its own history with it.
 */

type Draft = {
  id: string | null;
  name: string;
  station: string;
  note: string;
  active: boolean;
};

const newDraft = (): Draft => ({ id: null, name: '', station: '', note: '', active: true });

const editDraft = (o: Operator): Draft => ({
  id: o.id,
  name: o.name,
  station: o.station ?? '',
  note: o.note ?? '',
  active: o.active,
});

export function OperatorRoll() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [rows, setRows] = useState<Operator[]>([]);
  const [stations, setStations] = useState<OperatorStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Stood-down operators included: this is the list that keeps them, and the
      // office cannot bring somebody back that the screen will not show them.
      setRows(await operatorService.list(true));
      setUnavailable('');
    } catch (err) {
      setUnavailable(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  useEffect(() => {
    let live = true;
    operatorService
      .stations()
      .then((list) => live && setStations(list))
      .catch(() => live && setStations([]));
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    if (name.length < 2) {
      notify('A name of at least 2 characters is needed', 'warn');
      return;
    }

    setSaving(true);
    try {
      if (draft.id === null) {
        await operatorService.create({
          name,
          station: draft.station || null,
          note: draft.note.trim() || null,
        });
        notify(`${name} is on the operator list`);
      } else {
        await operatorService.update(draft.id, {
          name,
          station: draft.station || null,
          note: draft.note.trim() || null,
          active: draft.active,
        });
        notify('Operator saved');
      }
      setDraft(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const stand = async (o: Operator) => {
    try {
      await operatorService.update(o.id, { active: !o.active });
      notify(o.active ? `${o.name} stood down` : `${o.name} back on the list`);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    }
  };

  const labelOf = (key?: string | null) =>
    stations.find((s) => s.key === key)?.label ?? key ?? '';

  return (
    <>
      <div className="grouphead">Operators</div>
      <div className="sub mx-0.5">
        Who runs the lines. No PIN and no login — the supervisor puts these names against the
        lines each shift on the Machines tab, and the efficiency figures are read against them.
      </div>

      {loading && <div className="spin">Loading operators…</div>}

      {/*
        The list is not there yet if migration 0019 has not been applied, and a
        red box that says so is worth more than an empty list that looks like a
        plant with no operators.
      */}
      {!loading && unavailable && (
        <div className="errbox">Couldn’t load the operator list: {unavailable}</div>
      )}

      {!loading && !unavailable && !rows.length && (
        <div className="empty">Nobody on the operator list yet.</div>
      )}

      {!loading &&
        rows.map((o) => (
          <div key={o.id} className="mrow flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="mn truncate">{o.name}</span>
                {o.station && <span className="badge shrink-0">{labelOf(o.station)}</span>}
              </div>
              {o.note && <div className="mk mt-1">{o.note}</div>}
            </div>
            <div className="row gap-2">
              <span className={`badge ${o.active ? 'ok' : 'none'}`}>
                {o.active ? 'on the list' : 'stood down'}
              </span>
              <button type="button" className="btn ghost" onClick={() => setDraft(editDraft(o))}>
                Edit
              </button>
              <button type="button" className="btn ghost" onClick={() => void stand(o)}>
                {o.active ? 'Stand down' : 'Bring back'}
              </button>
            </div>
          </div>
        ))}

      {!unavailable && (
        <button type="button" className="btn block mt-2.5" onClick={() => setDraft(newDraft())}>
          + Add operator
        </button>
      )}

      <BoModal
        open={Boolean(draft)}
        title={draft?.id ? 'Edit operator' : 'New operator'}
        subtitle="A name the supervisor picks from when setting who is on each line."
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : draft?.id ? 'Save' : 'Add'}
          </button>
        }
      >
        {draft && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="op-name">Name</label>
              <input
                id="op-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="sub mt-1">
                Spell it the way the plant says it. This is the name the incentive is totted up
                against, so the same person spelt two ways is paid as two people.
              </div>
            </div>
            <div className="field">
              <label htmlFor="op-station">Usually on</label>
              <select
                id="op-station"
                value={draft.station}
                onChange={(e) => setDraft({ ...draft, station: e.target.value })}
              >
                <option value="">— no usual line —</option>
                {stations.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="sub mt-1">
                A note for whoever is filling the roster in, never a rule — what says who was on a
                line is the shift’s own roster.
              </div>
            </div>
            <div className="field">
              <label htmlFor="op-note">Note</label>
              <input
                id="op-note"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="optional"
              />
            </div>
            {draft.id && (
              <div className="field">
                <label htmlFor="op-active">On the list</label>
                <select
                  id="op-active"
                  value={draft.active ? 'active' : 'stood-down'}
                  onChange={(e) => setDraft({ ...draft, active: e.target.value === 'active' })}
                >
                  <option value="active">on the list</option>
                  <option value="stood-down">stood down</option>
                </select>
                <div className="sub mt-1">
                  Standing somebody down takes them out of the supervisor’s picker and leaves every
                  shift already recorded against them exactly as it is.
                </div>
              </div>
            )}
          </div>
        )}
      </BoModal>
    </>
  );
}

export default OperatorRoll;
