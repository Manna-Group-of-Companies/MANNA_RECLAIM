import { useCallback, useEffect, useMemo, useState } from 'react';
import { BatchRef, BoModal, QualityChip } from '@/components/ui';
import { reportService } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import { useAppSelector } from '@/app/hooks';
import { dayLong, lastNDays, todayISO } from '@/utils/date';
import { num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { BatchEfficiency as Payload, BatchUnit } from '@/types/models';

/**
 * The special line read one batch at a time.
 *
 * Every other efficiency screen is a shift's, which answers "how did last night
 * go" and cannot answer the question the plant is actually stuck on: what to do
 * with a charge once it is out of the vessel. Special and skip SuperFine, then
 * Fine and Medium. Sometimes Fine alone. It is decided by what the market wants
 * that week, and nobody has been able to see what each way of working costs,
 * because the cost lands in whichever shifts the batch happened to straddle.
 *
 * So the top of this screen is not the batch list that was asked for. It is the
 * recipes, because one batch is an anecdote: batch 3043 got 76 kg per man-hour
 * and that is a fact about one Tuesday, while fifteen batches taken as Fine
 * alone averaging 53 against forty-six taken Special-then-Fine averaging 39 is
 * a fact about the plant. The list underneath is the working, and the place to
 * go when the answer is disputed.
 */

const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 0, label: 'Everything' },
];

type Sort = 'pmh' | 'yield' | 'out' | 'kwh' | 'recent';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'pmh', label: 'Per man-hour' },
  { key: 'yield', label: 'Yield' },
  { key: 'out', label: 'Output' },
  { key: 'kwh', label: 'Electricity' },
  { key: 'recent', label: 'Most recent' },
];

/** A grade sequence as the plant says it: Special › Fine › Medium. */
function Recipe({ recipe }: { recipe: string[] }) {
  if (!recipe.length) return <span className="muted">—</span>;
  return (
    <span className="whitespace-nowrap">
      {recipe.map((grade, i) => (
        <span key={grade}>
          {i > 0 && <span className="muted mx-1">›</span>}
          <QualityChip quality={grade} />
        </span>
      ))}
    </span>
  );
}

export function BatchEfficiency() {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [days, setDays] = useState(90);
  const [family, setFamily] = useState('Special');
  const [sort, setSort] = useState<Sort>('pmh');
  const [open, setOpen] = useState<BatchUnit | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const window = days ? lastNDays(days) : { from: undefined, to: undefined };
      setData(await reportService.batchEfficiency({ from: window.from, to: window.to ?? todayISO() }));
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  /*
   * Which products the window actually holds, in the order they matter. A
   * picker offering DRC on a fortnight that ran none is a filter that answers
   * with an empty screen.
   */
  const families = useMemo(() => {
    const seen = new Map<string, number>();
    for (const b of data?.batches ?? []) {
      const key = b.family ?? 'Other';
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));
  }, [data]);

  const mine = useMemo(
    () => (data?.batches ?? []).filter((b) => (b.family ?? 'Other') === family),
    [data, family],
  );

  const recipes = useMemo(
    () => (data?.recipes ?? []).filter((r) => (r.family ?? 'Other') === family),
    [data, family],
  );

  const sound = useMemo(() => mine.filter((b) => b.comparable), [mine]);
  const setAside = useMemo(() => mine.filter((b) => !b.comparable), [mine]);

  const listed = useMemo(() => {
    const by: Record<Sort, (b: BatchUnit) => number> = {
      pmh: (b) => b.pmh ?? -1,
      yield: (b) => b.yieldPct ?? -1,
      out: (b) => b.out ?? -1,
      // Least is best, so it is ranked from the other end.
      kwh: (b) => -(b.kwhkg ?? Number.MAX_SAFE_INTEGER),
      recent: () => 0,
    };
    if (sort === 'recent') {
      return [...sound].sort((a, b) => String(b.lastDay).localeCompare(String(a.lastDay)));
    }
    return [...sound].sort((a, b) => by[sort](b) - by[sort](a));
  }, [sound, sort]);

  const best = recipes[0] ?? null;
  const usual = useMemo(
    () => [...recipes].sort((a, b) => b.batches - a.batches)[0] ?? null,
    [recipes],
  );

  if (error) return <div className="panel"><div className="err">{error}</div></div>;
  if (loading && !data) return <div className="panel"><div className="muted">Reading the record…</div></div>;

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
        {families.length > 1 && (
          <div className="chips mt-2">
            {families.map((f) => (
              <button
                key={f.key}
                type="button"
                className={cn('chip', family === f.key && 'on')}
                onClick={() => setFamily(f.key)}
              >
                {f.key} · {f.n}
              </button>
            ))}
          </div>
        )}
        {/*
          A batch is a whole thing and the window only chooses which of them are
          listed. Said here because the alternative reading - that a 30-day
          window counts 30 days of a batch that took 40 - is exactly the error
          this view exists to end, and a reader who assumed it would mistrust
          every figure below.
        */}
        <div className="hint mt-2">
          Each batch is counted whole, from its charge to its last weighing, wherever those
          fell. The window only chooses which batches are listed.
        </div>
      </div>

      {/*
        The answer, before the working.

        The plant's aim is the most production out of a shift, and the lever it
        has is which cuts to take off a charge. This is that lever, measured.
      */}
      {recipes.length > 0 && (
        <div className="panel mt-3">
          <div className="grouphead">How the batch was taken · {family}</div>
          <div className="scroll-x">
            <table className="tt min-w-[620px]">
              <thead>
                <tr>
                  <th>Cuts taken, in order</th>
                  <th className="tnum">Batches</th>
                  <th className="tnum">Avg out</th>
                  <th className="tnum">Per man-hour</th>
                  <th className="tnum">kWh/kg</th>
                  <th className="tnum">Yield</th>
                  <th>Best</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.key} className={cn(r.batches < 3 && 'opacity-70')}>
                    <td><Recipe recipe={r.recipe} /></td>
                    <td className="tnum">
                      {r.batches}
                      {r.batches < 3 && (
                        <span className="muted text-[10px] ml-1">too few to lean on</span>
                      )}
                    </td>
                    <td className="tnum">{num(r.out, 0)} kg</td>
                    <td className="tnum"><strong>{num(r.pmh, 1)}</strong></td>
                    <td className="tnum">{num(r.kwhkg, 3)}</td>
                    <td className="tnum">
                      {r.yieldPct == null ? <span className="muted">—</span> : `${num(r.yieldPct, 0)}%`}
                      {r.yieldPct != null && r.yieldFrom < r.batches && (
                        <span className="muted text-[10px] ml-1">of {r.yieldFrom}</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setOpen(mine.find((b) => b.batch === r.best) ?? null)}
                      >
                        {r.best}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best && usual && best.recipeKey !== usual.recipeKey && best.batches >= 3 && usual.pmh != null && best.pmh != null && (
            /*
              Spelled out rather than left to be read off the table. The gap
              between the best way and the usual way is the whole finding, and a
              table of six rows is a place where a reader sees the row they
              expected to see.
            */
            <div className="hint mt-2">
              <strong>{best.recipeKey}</strong> has averaged {num(best.pmh, 1)} kg per man-hour
              over {best.batches} batches. The line&rsquo;s usual{' '}
              <strong>{usual.recipeKey}</strong> averaged {num(usual.pmh, 1)} over {usual.batches}
              {' '}— {num(((best.pmh - usual.pmh) / usual.pmh) * 100, 0)}% less production from the
              same hours
              {best.kwhkg != null && usual.kwhkg != null && best.kwhkg < usual.kwhkg
                ? `, and ${num(((usual.kwhkg - best.kwhkg) / usual.kwhkg) * 100, 0)}% more electricity per kilogram`
                : ''}
              .
            </div>
          )}
        </div>
      )}

      <div className="panel mt-3">
        <div className="grouphead">
          Every batch · {listed.length}
          {data?.summary.pmh != null && (
            <span className="muted font-normal ml-2">
              the line averages {num(data.summary.pmh, 1)} kg per man-hour over these
            </span>
          )}
        </div>
        <div className="chips mb-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={cn('chip', sort === s.key && 'on')}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="scroll-x">
          <table className="tt min-w-[640px]">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Cuts taken</th>
                <th className="tnum">Out</th>
                <th className="tnum">Man-hours</th>
                <th className="tnum">Per man-hour</th>
                <th className="tnum">kWh/kg</th>
                <th className="tnum">Yield</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((b) => (
                <tr key={b.batch} className="cursor-pointer" onClick={() => setOpen(b)}>
                  <td>
                    <BatchRef>{b.batch}</BatchRef>
                    <div className="muted text-[10px]">
                      {b.lastDay ? dayLong(b.lastDay) : '—'}
                      {b.shifts > 1 ? ` · ${b.shifts} shifts` : ''}
                    </div>
                  </td>
                  <td><Recipe recipe={b.recipe} /></td>
                  <td className="tnum">{num(b.out, 0)}</td>
                  <td className="tnum">{num(b.labour, 1)}</td>
                  <td className="tnum"><strong>{num(b.pmh, 1)}</strong></td>
                  <td className="tnum">{num(b.kwhkg, 3)}</td>
                  <td className="tnum">
                    {b.yieldPct == null ? <span className="muted">—</span> : `${num(b.yieldPct, 0)}%`}
                  </td>
                </tr>
              ))}
              {!listed.length && (
                <tr><td colSpan={7} className="muted">No batches of this product in the window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        The batches that are not in the comparison, and why.

        Kept on the screen rather than dropped from it. Every one of these is a
        pass somebody can go and correct, and a batch that vanished without
        explanation would be read as a batch that was never worked.
      */}
      {setAside.length > 0 && (
        <div className="panel mt-3">
          <div className="grouphead">Left out of the comparison · {setAside.length}</div>
          <div className="hint">
            The record of these batches makes their rate wrong rather than merely poor, so
            ranking them would recommend a way of working that nobody actually worked. Each
            one is a pass that can be corrected on the History tab.
          </div>
          <div className="scroll-x mt-2">
            <table className="tt min-w-[520px]">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Cuts taken</th>
                  <th>What is wrong with the record</th>
                </tr>
              </thead>
              <tbody>
                {setAside.map((b) => (
                  <tr key={b.batch} className="cursor-pointer" onClick={() => setOpen(b)}>
                    <td><BatchRef>{b.batch}</BatchRef></td>
                    <td><Recipe recipe={b.recipe} /></td>
                    <td>
                      {b.faults.map((f) => (
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
        title={open ? `Batch ${open.batch}` : ''}
        subtitle={
          open
            ? `${open.formulation ?? 'no charge on record'}${
              open.chargedOn ? ` · charged ${dayLong(open.chargedOn)}` : ''
            }`
            : ''
        }
        onClose={() => setOpen(null)}
      >
        {open && (
          <>
            <div className="roRow">
              <span className="k">Cuts taken, in order</span>
              <span className="v"><Recipe recipe={open.recipe} /></span>
            </div>
            <div className="roRow">
              <span className="k">Weighed out</span>
              <span className="v">
                {num(open.out, 0)} kg
                {open.charged ? (
                  <span className="muted"> of {num(open.charged, 0)} kg charged</span>
                ) : null}
              </span>
            </div>
            <div className="roRow">
              <span className="k">Labour</span>
              <span className="v">
                {num(open.labour, 1)} man-hours
                <span className="muted"> over {open.passes} passes in {open.shifts} shift{open.shifts === 1 ? '' : 's'}</span>
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

            {open.limits.map((l) => (
              <div key={l.key} className="hint mt-2">
                <strong>{l.what}.</strong> {l.why}
              </div>
            ))}
            {open.faults.map((f) => (
              <div key={f.key} className="err mt-2">
                <strong>{f.what}.</strong> {f.why}
              </div>
            ))}

            {/*
              What each cut cost on its own - the row that answers whether a
              grade earned the refining it took. A cut that is 8% of the output
              for a third of the hours is the one to stop taking.
            */}
            <div className="grouphead">Each cut</div>
            <div className="scroll-x">
              <table className="tt min-w-[420px]">
                <thead>
                  <tr>
                    <th>Cut</th>
                    <th className="tnum">Out</th>
                    <th className="tnum">Share</th>
                    <th className="tnum">Man-hours</th>
                    <th className="tnum">Per man-hour</th>
                    <th className="tnum">kWh/kg</th>
                  </tr>
                </thead>
                <tbody>
                  {open.cuts.map((c) => (
                    <tr key={c.quality}>
                      <td><QualityChip quality={c.quality} /></td>
                      <td className="tnum">{num(c.out, 0)} kg</td>
                      <td className="tnum">{c.share == null ? '—' : `${num(c.share, 0)}%`}</td>
                      <td className="tnum">{num(c.labour, 1)}</td>
                      <td className="tnum">{num(c.pmh, 1)}</td>
                      <td className="tnum">{num(c.kwhkg, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grouphead">Every pass · {open.parts.length}</div>
            <div className="scroll-x">
              <table className="tt min-w-[520px]">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Machine</th>
                    <th>Cut</th>
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
                        {p.day ? dayLong(p.day) : '—'}
                        <div className="muted text-[10px]">{p.shift ?? ''}</div>
                      </td>
                      <td>
                        {p.machine ?? p.machineId ?? '—'}
                        {p.entered === 'twice' && (
                          <div className="muted text-[10px]">same meter span as another pass</div>
                        )}
                      </td>
                      <td>{p.quality ?? '—'}</td>
                      <td className="tnum">{p.workers ?? <span className="muted">none</span>}</td>
                      <td className="tnum">{num(p.hours, 1)}</td>
                      <td className="tnum">{num(p.labour, 1)}</td>
                      <td className="tnum">
                        {p.out ? `${num(p.out, 0)} kg` : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint mt-2">
              Man-hours are each pass&rsquo;s own crew times its own hours, added up — not the
              summed crew times the summed hours, which on a batch worked in several passes is
              more than twice the labour actually spent.
            </div>
          </>
        )}
      </BoModal>
    </>
  );
}
