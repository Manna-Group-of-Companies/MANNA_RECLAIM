import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { machineService } from '@/api/services/machine.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import type { Machine, MachineType } from '@/types/models';

/**
 * The machine list, and the presses in particular.
 *
 * `kind` is what the run rules switch on - does it weigh, does it need a
 * quality, does it log bearings - and is not edited here, because changing it
 * would change how every run against that machine is treated. `type` is the
 * finer name the list is read under, and the platen figures are the press's own
 * dimensions: length, width, how many daylights, and what it holds.
 *
 * All five are null on everything that is not a press, and stay null until
 * somebody measures them. A zero would read as a measurement rather than as an
 * absence, so blank clears the figure instead of sending one.
 */

const TYPES: MachineType[] = [
  'grinder',
  'cracker',
  'autoclave',
  'prerefiner',
  'refiner',
  'press',
  // The two activities that make finished goods a lot at a time. They carry no
  // platen figures - a sleeve bench has none - so they read here as what they
  // are and nothing more.
  'sleeve',
  'loop',
  'other',
];

interface Draft {
  id: string;
  name: string;
  type: string;
  platenLengthMm: string;
  platenWidthMm: string;
  platenCount: string;
  capacityKg: string;
}

const text = (value: number | null | undefined) => (value == null ? '' : String(value));

const draftOf = (machine: Machine): Draft => ({
  id: machine.id,
  name: machine.name,
  type: machine.type ?? '',
  platenLengthMm: text(machine.platen_length_mm),
  platenWidthMm: text(machine.platen_width_mm),
  platenCount: text(machine.platen_count),
  capacityKg: text(machine.capacity_kg),
});

/** Blank clears the figure rather than sending a zero anything would read. */
const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

/** `1200 × 600 mm · 3 daylights`, or what of it is known. */
const platenLine = (machine: Machine) => {
  const size =
    machine.platen_length_mm != null && machine.platen_width_mm != null
      ? `${machine.platen_length_mm} × ${machine.platen_width_mm} mm`
      : null;
  const parts = [
    size,
    machine.platen_count != null ? `${machine.platen_count} daylights` : null,
    machine.capacity_kg != null ? `${machine.capacity_kg} kg` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

export function MachinesPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [rows, setRows] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await machineService.list({ limit: 200, order: 'asc' })).rows);
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await machineService.update(draft.id, {
        type: (draft.type || null) as MachineType | null,
        platen_length_mm: asNumber(draft.platenLengthMm),
        platen_width_mm: asNumber(draft.platenWidthMm),
        platen_count: asNumber(draft.platenCount),
        capacity_kg: asNumber(draft.capacityKg),
      });
      notify('Machine updated');
      setDraft(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const presses = rows.filter((machine) => machine.kind === 'press');
  const others = rows.filter((machine) => machine.kind !== 'press');

  const row = (machine: Machine) => {
    const platen = platenLine(machine);
    return (
      <div key={machine.id} className="mrow">
        <div>
          <div className="mn">
            {machine.name} <span className="muted font-normal">{machine.id}</span>
          </div>
          <div className="mk">
            {machine.type ?? machine.kind}
            {machine.group_name ? ` · ${machine.group_name}` : ''}
            {machine.kind === 'press' && (
              <> · {platen ?? <span className="muted">platen not measured</span>}</>
            )}
          </div>
        </div>
        <div className="row gap-2">
          <span className={`badge ${machine.enabled ? 'ok' : 'none'}`}>
            {machine.enabled ? 'in use' : 'off'}
          </span>
          <button type="button" className="btn ghost" onClick={() => setDraft(draftOf(machine))}>
            Edit
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Machines</h1>
        <div className="sub">
          What the plant runs on. A machine&apos;s kind decides how its runs are treated and is not
          edited here; what is, is the name it is listed under and — on a press — the platen it
          moulds on.
        </div>
      </div>

      {loading && <div className="spin">Loading machines…</div>}

      {!loading && (
        <>
          <div className="mx-0.5 mt-3">
            <h2 className="text-base">Moulding presses</h2>
          </div>
          {presses.length ? presses.map(row) : <div className="empty">No presses on the list.</div>}

          <div className="mx-0.5 mt-4">
            <h2 className="text-base">Everything else</h2>
          </div>
          {others.map(row)}
        </>
      )}

      <BoModal
        open={Boolean(draft)}
        title={draft ? `Edit ${draft.name}` : ''}
        subtitle="Leave a figure blank until it has been measured — the list then says so rather than stating a number nobody checked."
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      >
        {draft && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="m-type">Type</label>
              <select
                id="m-type"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              >
                <option value="">Not set</option>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <div className="sub mt-1">
                The finer name this is listed under. A cracker and a grinder are both `grind` to the
                run rules and two different machines on the floor.
              </div>
            </div>
            <div className="field">
              <label htmlFor="m-len">
                Platen length <span className="muted font-normal">(mm)</span>
              </label>
              <input
                id="m-len"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.platenLengthMm}
                onChange={(e) => setDraft({ ...draft, platenLengthMm: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m-wid">
                Platen width <span className="muted font-normal">(mm)</span>
              </label>
              <input
                id="m-wid"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.platenWidthMm}
                onChange={(e) => setDraft({ ...draft, platenWidthMm: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m-count">Platens / daylights</label>
              <input
                id="m-count"
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={draft.platenCount}
                onChange={(e) => setDraft({ ...draft, platenCount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m-cap">
                Capacity <span className="muted font-normal">(kg)</span>
              </label>
              <input
                id="m-cap"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.capacityKg}
                onChange={(e) => setDraft({ ...draft, capacityKg: e.target.value })}
              />
            </div>
          </div>
        )}
      </BoModal>
    </>
  );
}

export default MachinesPage;
