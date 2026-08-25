import type { ReactNode } from 'react';
import { TYRES, type TyreType } from '@/config/constants';
import { clock24, dayLong, dayMonth } from '@/utils/date';
import { hours, kwhOf, num } from '@/utils/format';
import type { Run } from '@/types/models';

/**
 * Everything the plant recorded about one run, read rather than corrected.
 *
 * There are two ways into a run in this app and there used to be only one shape
 * behind them. The shop floor and the back office both open a *form* - the run
 * is theirs to put right - and the managing director, who may correct nothing,
 * was therefore given nothing at all: a row on their History tab did not open,
 * on the reasoning that a form with every button disabled is worse than no form.
 *
 * That reasoning was half right. A disabled form is a bad answer; no answer is a
 * worse one. Reading the record is not the same act as changing it, and the one
 * account that only ever reads was the one account that could not see what it
 * was reading - seven columns of a table and nothing underneath them.
 *
 * So this is the record itself, with no controls on it. It carries what the
 * floor's Full record carries and, above that, the figures the floor reads out
 * of its own input boxes - which are only visible there because the boxes have
 * values in them, and are invisible anywhere the boxes are not drawn.
 */

/** Nothing recorded reads as a dash rather than as an empty gap. */
const show = (value: ReactNode) => (value == null || value === '' ? '—' : value);

/** "29 Jul 12:35" - the day and the 24-hour clock the shop floor reads. */
const stamp = (iso?: string | null) => (iso ? `${dayMonth(iso)} ${clock24(iso)}` : null);

/** One line of the record: what it is on the left, what it reads on the right. */
export function Det({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="detrow">
      <span className="k">{k}</span>
      <span className="v">{show(v)}</span>
    </div>
  );
}

/**
 * The tail of the record: what the run *was*, as against what it measured.
 *
 * Shared with the shop floor's edit sheet rather than written out twice. The two
 * would have drifted, and the drift is invisible from either screen - each looks
 * complete on its own, and only somebody holding a tablet next to a laptop would
 * ever find out that one of them stopped saying who logged it.
 */
export function RunFullRecord({ run, machineName }: { run: Run; machineName?: string | null }) {
  const isAuto = run.kind === 'autoclave';
  const isPress = run.kind === 'press';
  const isShiftwise = run.line === 'grind' || run.line === 'coarse';
  const tyre = run.tyre_type ? TYRES[run.tyre_type as TyreType] : null;

  return (
    <>
      <Det k="Machine" v={`${run.machine ?? machineName ?? '—'} · ${run.machine_id}`} />
      <Det k="Line" v={run.line} />
      <Det
        k="Type"
        v={isAuto ? 'Autoclave' : isPress ? 'Press' : isShiftwise ? 'Shiftwise' : 'Batch'}
      />
      {isPress && (
        <>
          <Det k="Product" v={run.product} />
          <Det
            k="Moulded at"
            v={`${run.cure_temp_c != null ? `${run.cure_temp_c} °C` : 'temp not set'} · ${
              run.cyclic_min != null ? `${run.cyclic_min} min` : 'cycle not set'
            } · ${run.cavities ?? '—'} cavities`}
          />
          <Det k="Compound rate" v={run.compound_rate != null ? `₹${run.compound_rate}/kg` : null} />
          <Det
            k="Material cost"
            v={
              run.material_cost != null
                ? `₹${run.material_cost}${run.cost_per_piece != null ? ` · ₹${run.cost_per_piece} a piece` : ''}`
                : null
            }
          />
        </>
      )}
      <Det k="Formulation" v={run.formulation} />
      <Det k="Capacity" v={run.capacity != null ? `${run.capacity} kg` : null} />
      <Det k="Tyre" v={tyre ? `${tyre.label} ${run.mesh ?? tyre.mesh}` : run.mesh} />
      <Det k="Mix sources" v={run.sources?.length ? run.sources.join(' + ') : null} />
      <Det k="Start / end" v={`${show(stamp(run.started_at))} → ${show(stamp(run.ended_at))}`} />
      {/*
        The three moments inside an autoclave cycle. Only the vessels record
        them, and only since migration 0018 - a charge cooked before that shows
        the pair of dashes rather than nothing, because "not recorded" is an
        answer somebody comparing loading times needs to be given.
      */}
      {isAuto && (run.pressure_at || run.door_open_at) && (
        <>
          <Det k="21 bar at" v={stamp(run.pressure_at)} />
          <Det k="Door opened" v={stamp(run.door_open_at)} />
        </>
      )}
      <Det k="Start/stops combined" v={run.passes ?? 1} />
      {Array.isArray(run.weigh_entries) && run.weigh_entries.length > 0 && (
        <Det k="Weighings" v={run.weigh_entries.join(' + ')} />
      )}
      {(run.leftout_in != null || run.leftout_out != null) && (
        <Det k="Carried in / out" v={`${run.leftout_in ?? 0} → ${run.leftout_out ?? 0} kg`} />
      )}
      {run.picking_labour_hours != null && (
        <Det
          k="Picking"
          v={`${run.picking_labourers} × ${run.picking_hours} h = ${run.picking_labour_hours} labourer-hours`}
        />
      )}
      {run.non_production ? <Det k="Non-production" v="Yes" /> : null}
      <Det k="Status" v={run.status === 'running' ? 'Running' : 'Logged'} />
      {/* The account the start was authenticated as. Blank on a run started
          before the column existed - see migrations/0013. */}
      <Det k="Logged by" v={run.entered_by} />
      <Det k="Record id" v={run.id} />
    </>
  );
}

/**
 * The whole record, for an account that reads it.
 *
 * Grouped the way the two editing screens group their fields, so somebody who
 * knows one screen can find a figure on this one - what ran, the shift, the
 * meters, what came off it, and then the record's own tail.
 */
export function RunRecord({ run, machineName }: { run: Run; machineName?: string | null }) {
  const isAuto = run.kind === 'autoclave';
  const isPress = run.kind === 'press';
  const h = hours(run);
  const k = kwhOf(run);
  const out = run.weight_kg ?? run.out_weight ?? null;

  return (
    <div className="mt-3">
      <div className="grouphead mt-0">What ran</div>
      <Det k="Batch" v={run.batch_no} />
      {!isPress && <Det k="Grade" v={run.quality} />}
      {isAuto && <Det k="Charge" v={run.capacity != null ? `${run.capacity} kg` : null} />}
      {isPress && <Det k="Product" v={run.product} />}

      <div className="grouphead">Shift</div>
      <Det k="Shift date" v={dayLong(run.shift_date)} />
      <Det k="Shift" v={run.shift} />
      {/* Both names, and they are different questions: the record was signed by
          whoever was holding the tablet, and it was logged by the account that
          was signed in. Where those disagree, both are worth reading. */}
      <Det k="Supervisor" v={run.supervisor} />
      <Det k="Logged by" v={run.entered_by} />
      <Det k="Crew" v={run.workers} />

      {!isAuto && !isPress && (
        <>
          <div className="grouphead">Electricity</div>
          <Det k="Reading at start" v={run.elec_start != null ? `${run.elec_start} units` : null} />
          <Det k="Reading at stop" v={run.elec_end != null ? `${run.elec_end} units` : null} />
          <Det
            k="Energy"
            v={
              k != null ? (
                <>
                  {num(k, 1)} kWh
                  {out ? <span className="muted"> · {num(k / out, 3)} kWh/kg</span> : null}
                </>
              ) : null
            }
          />

          <div className="grouphead">Hour meter</div>
          <Det k="Reading at start" v={run.hour_start != null ? `${run.hour_start} hrs` : null} />
          <Det k="Reading at stop" v={run.hour_end != null ? `${run.hour_end} hrs` : null} />
          <Det
            k="Hours run"
            v={
              h != null ? (
                <>
                  {num(h, 2)} h<span className="muted"> · {Math.round(h * 60)} min</span>
                </>
              ) : null
            }
          />
        </>
      )}

      <div className="grouphead">Output</div>
      <Det k={isPress ? 'Weight' : 'Output weight'} v={out != null ? `${num(out, 0)} kg` : null} />
      {isPress ? (
        <>
          <Det k="How many" v={run.pieces} />
          <Det k="Flash" v={run.flash_kg != null ? `${run.flash_kg} kg` : null} />
        </>
      ) : (
        <Det k="Packed sacks" v={run.packed_sacks} />
      )}
      {isAuto && <Det k="Firewood" v={run.firewood_kg != null ? `${run.firewood_kg} kg` : null} />}
      <Det k="Remarks" v={run.remarks} />

      <div className="grouphead">Full record</div>
      <RunFullRecord run={run} machineName={machineName} />
    </div>
  );
}

export default RunRecord;
