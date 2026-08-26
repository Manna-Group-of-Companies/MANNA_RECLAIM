import { useCallback, useEffect, useMemo, useState } from 'react';
import { BoModal } from '@/components/ui';
import { reportService } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import { useAppSelector } from '@/app/hooks';
import { dayLong, lastNDays, todayISO } from '@/utils/date';
import { num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { CoarseEfficiency as Coarse, CoarseShift } from '@/types/models';

/**
 * The coarse line, one shift at a time.
 *
 * The batch view cannot cover this half of the plant: PR1 and R2 work a
 * continuous flow out of a buffer and no pass on the line carries a batch
 * number, so there is nothing to hang a record on but the shift. Which suits
 * the question - the plant wants the most out of a shift, and here a shift is a
 * thing that can be set beside the shift before it.
 *
 * The line is two machines and one flow, and only R2 weighs. So every figure
 * here counts PR1's crew as well, in the shift the material was weighed out in
 * rather than the shift PR1 happened to run - see the note on the server.
 */

const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 0, label: 'Everything' },
];

type Sort = 'pmh' | 'out' | 'kwh' | 'recent';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'pmh', label: 'Per man-hour' },
  { key: 'out', label: 'Output' },
  { key: 'kwh', label: 'Electricity' },
  { key: 'recent', label: 'Most recent' },
];

export function CoarseEfficiency() {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [days, setDays] = useState(90);
  const [sort, setSort] = useState<Sort>('pmh');
  const [open, setOpen] = useState<CoarseShift | null>(null);
  const [data, setData] = useState<Coarse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const window = days ? lastNDays(days) : { from: undefined, to: undefined };
      const payload = await reportService.batchEfficiency({
        from: window.from,
        to: window.to ?? todayISO(),
      });
      setData(payload.coarse);
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const sound = useMemo(
    () => (data?.shifts ?? []).filter((u) => u.comparable),
    [data],
  );
  const setAside = useMemo(
    () => (data?.shifts ?? []).filter((u) => !u.comparable),
    [data],
  );

  const listed = useMemo(() => {
    if (sort === 'recent') return sound;
    const by: Record<Sort, (u: CoarseShift) => number> = {
      pmh: (u) => u.pmh ?? -1,
      out: (u) => u.out ?? -1,
      // Least is best, so it is ranked from the other end.
      kwh: (u) => -(u.kwhkg ?? Number.MAX_SAFE_INTEGER),
      recent: () => 0,
    };
    return [...sound].sort((a, b) => by[sort](b) - by[sort](a));
  }, [sound, sort]);

  if (error) return <div className="panel"><div className="err">{error}</div></div>;
  if (loading && !data) return <div className="panel"><div className="muted">Reading the record…</div></div>;

  const s = data?.summary;

  return (
    <>
      <div className="panel">
        <div className="chips">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              className={cn('chip', days === w.days && 'on')}
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="hint mt-2">
          PR1 and R2 are one line and only R2 weighs, so every figure here counts both crews —
          in the shift the material was weighed out in, wherever the pre-refining ran.
        </div>
      </div>

      {/*
        The window's own arithmetic, which is where a yield belongs on this line.

        The vessels are charged on the night shift for the day that follows, so
        one shift's output over one shift's charges reads 292% on a Tuesday and
        57% on the Thursday. Over a window the buffer averages out and the
        division means something again.
      */}
      {s && (
        <div className="panel mt-3">
          <div className="grouphead">Over this window</div>
          <div className="roRow">
            <span className="k">Weighed out</span>
            <span className="v">
              {num(s.out, 0)} kg
              <span className="muted"> over {s.shifts} shift{s.shifts === 1 ? '' : 's'}</span>
            </span>
          </div>
          <div className="roRow">
            <span className="k">Charged in</span>
            <span className="v">
              {num(s.charged, 0)} kg
              <span className="muted"> · {s.charges} vessel charge{s.charges === 1 ? '' : 's'}</span>
            </span>
          </div>
          <div className="roRow">
            <span className="k">Yield</span>
            <span className="v">
              <strong>{s.yieldPct == null ? '—' : `${num(s.yieldPct, 1)}%`}</strong>
              <span className="muted"> of what went into the vessels came back over the scale</span>
            </span>
          </div>
          <div className="roRow">
            <span className="k">Production / man-hour</span>
            <span className="v"><strong>{num(s.pmh, 1)}</strong> kg/man-hour</span>
          </div>
          <div className="hint mt-2">
            The yield is the window&rsquo;s, not a shift&rsquo;s. The vessels cook overnight for the
            day that follows, so inside one shift that division is arithmetic about a buffer
            rather than a fact about a crew.
          </div>
        </div>
      )}

      {Boolean(data?.groups.length) && (
        <div className="panel mt-3">
          <div className="grouphead">Day against night</div>
          <div className="scroll-x">
            <table className="tt min-w-[560px]">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th className="tnum">Shifts</th>
                  <th className="tnum">Avg out</th>
                  <th className="tnum">Avg man-hours</th>
                  <th className="tnum">Per man-hour</th>
                  <th className="tnum">kWh/kg</th>
                  <th>Best</th>
                </tr>
              </thead>
              <tbody>
                {data?.groups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.shift}</td>
                    <td className="tnum">{g.shifts}</td>
                    <td className="tnum">{num(g.out, 0)} kg</td>
                    <td className="tnum">{num(g.labour, 1)}</td>
                    <td className="tnum"><strong>{num(g.pmh, 1)}</strong></td>
                    <td className="tnum">{num(g.kwhkg, 3)}</td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setOpen(g.best)}
                      >
                        {dayLong(g.best.day)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel mt-3">
        <div className="grouphead">Every shift · {listed.length}</div>
        <div className="chips mb-2">
          {SORTS.map((x) => (
            <button
              key={x.key}
              type="button"
              className={cn('chip', sort === x.key && 'on')}
              onClick={() => setSort(x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="scroll-x">
          <table className="tt min-w-[560px]">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Machines</th>
                <th className="tnum">Out</th>
                <th className="tnum">Man-hours</th>
                <th className="tnum">Per man-hour</th>
                <th className="tnum">kWh/kg</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((u) => (
                <tr
                  key={`${u.day}|${u.shift}`}
                  className="cursor-pointer"
                  onClick={() => setOpen(u)}
                >
                  <td>
                    {dayLong(u.day)}
                    <div className="muted text-[10px]">{u.shift} shift</div>
                  </td>
                  <td>{u.machines.join(' + ')}</td>
                  <td className="tnum">{num(u.out, 0)}</td>
                  <td className="tnum">{num(u.labour, 1)}</td>
                  <td className="tnum"><strong>{num(u.pmh, 1)}</strong></td>
                  <td className="tnum">{num(u.kwhkg, 3)}</td>
                </tr>
              ))}
              {!listed.length && (
                <tr><td colSpan={6} className="muted">The coarse line did not run in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {setAside.length > 0 && (
        <div className="panel mt-3">
          <div className="grouphead">Left out of the comparison · {setAside.length}</div>
          <div className="hint">
            The record of these shifts makes the rate wrong rather than merely poor. Each one is
            a pass that can be corrected on the History tab.
          </div>
          <div className="scroll-x mt-2">
            <table className="tt min-w-[520px]">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th className="tnum">Out</th>
                  <th>What is wrong with the record</th>
                </tr>
              </thead>
              <tbody>
                {setAside.map((u) => (
                  <tr
                    key={`${u.day}|${u.shift}`}
                    className="cursor-pointer"
                    onClick={() => setOpen(u)}
                  >
                    <td>
                      {dayLong(u.day)}
                      <div className="muted text-[10px]">{u.shift} shift</div>
                    </td>
                    <td className="tnum">{num(u.out, 0)}</td>
                    <td>
                      {u.faults.map((f) => (
                        <div key={f.key}>
                          {f.what}
                          <div className="muted text-[10px]">{f.why}</div>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BoModal
        open={Boolean(open)}
        title="Coarse line"
        subtitle={open ? `${dayLong(open.day)} · ${open.shift} shift` : ''}
        onClose={() => setOpen(null)}
      >
        {open && (
          <>
            <div className="roRow">
              <span className="k">Weighed out</span>
              <span className="v">{num(open.out, 0)} kg</span>
            </div>
            <div className="roRow">
              <span className="k">Labour</span>
              <span className="v">
                {num(open.labour, 1)} man-hours
                <span className="muted"> over {open.passes} pass{open.passes === 1 ? '' : 'es'}</span>
              </span>
            </div>
            <div className="roRow">
              <span className="k">Production / man-hour</span>
              <span className="v"><strong>{num(open.pmh, 2)}</strong> kg/man-hour</span>
            </div>
            <div className="roRow">
              <span className="k">Electricity</span>
              <span className="v">
                {num(open.kwh, 1)} kWh
                {open.kwhkg != null && <span className="muted"> · {num(open.kwhkg, 3)} kWh/kg</span>}
              </span>
            </div>

            {open.faults.map((f) => (
              <div key={f.key} className="err mt-2">
                <strong>{f.what}.</strong> {f.why}
              </div>
            ))}

            <div className="grouphead">Every pass · {open.parts.length}</div>
            <div className="scroll-x">
              <table className="tt min-w-[480px]">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th className="tnum">Crew</th>
                    <th className="tnum">Hours</th>
                    <th className="tnum">Man-hours</th>
                    <th className="tnum">Out</th>
                  </tr>
                </thead>
                <tbody>
                  {open.parts.map((p) => (
                    <tr key={p.runId}>
                      <td>
                        {p.machine ?? p.machineId ?? '—'}
                        {/*
                          PR1 feeds R2 and the two are not always logged in the
                          same shift. The figure belongs to the shift that
                          weighed it out; the hours were worked when they were
                          worked, and a reader not told would take it for a
                          mistake in the record.
                        */}
                        {p.shift && p.shift !== open.shift && (
                          <div className="muted text-[10px]">
                            ran on the {p.shift} shift
                            {p.day && p.day !== open.day ? `, ${dayLong(p.day)}` : ''}
                          </div>
                        )}
                        {p.entered === 'twice' && (
                          <div className="muted text-[10px]">same meter span as another pass</div>
                        )}
                      </td>
                      <td className="tnum">{p.workers ?? <span className="muted">none</span>}</td>
                      <td className="tnum">{num(p.hours, 1)}</td>
                      <td className="tnum">{num(p.labour, 1)}</td>
                      <td className="tnum">
                        {p.out ? `${num(p.out, 0)} kg` : <span className="muted">weighed nothing</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint mt-2">
              Man-hours are each pass&rsquo;s own crew times its own hours, added up — not the
              summed crew times the summed hours, which on a line worked in several passes is
              more than twice the labour actually spent.
            </div>
          </>
        )}
      </BoModal>
    </>
  );
}
