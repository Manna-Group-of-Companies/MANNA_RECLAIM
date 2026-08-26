import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { dispatchService } from '@/api/services/dispatch.service';
import { toRequestError } from '@/api/axiosClient';
import { dayLong, whenLast } from '@/utils/date';
import { num, rupees } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { SapDispatchRow, SapDispatches } from '@/types/models';

/**
 * What the plant has been shipping, read off SAP.
 *
 * The managing director's question, and one no screen here could answer: the
 * plant raises its documents in SAP, so this end has never had them. A script on
 * the plant server reads three months of them once a day and posts what it
 * finds.
 *
 * Read four ways down the page, because "what have we been shipping" is really
 * four questions with different answers: which days it went out on, which grades
 * it went out as, who bought it, and then the documents themselves - which are
 * the evidence rather than the answer.
 *
 * A day can be picked out of the quarter, and everything below narrows to it.
 * The picker is the list of days that actually had a dispatch rather than a date
 * box, for the reason a date box is wrong here: most days in a quarter had none,
 * so a calendar mostly offers empty answers and gives no clue which days are
 * worth opening. The list is the answer to "when did we ship" before anything
 * is clicked.
 *
 * Every figure is a line off a document, never an aggregate SAP was asked for.
 * That is what lets the page show a total and then explain it, and it is why a
 * day can be picked at all - the whole window is here, so narrowing is instant
 * and costs no request.
 */

/** How much, in whichever units the rows carry - kg and pieces stay apart. */
const quantitySaid = (rows: SapDispatchRow[]) => {
  const byUnit = new Map<string, number>();
  for (const r of rows) byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + r.quantity);
  return [...byUnit].map(([unit, qty]) => `${num(qty, 0)} ${unit}`).join(' · ');
};

/**
 * What a set of lines came to, or null.
 *
 * Null where nothing carried a value and null where two currencies did - a
 * total across both is a number with no unit, and on a page about money it
 * would be believed. The plant sells in rupees, so the case is unlikely and the
 * answer to it is a blank rather than a guess.
 */
const valueSaid = (rows: SapDispatchRow[]) => {
  const valued = rows.filter((r) => r.value != null);
  if (!valued.length) return null;
  const currencies = new Set(valued.map((r) => r.currency ?? ''));
  if (currencies.size > 1) return null;
  const amount = valued.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const currency = [...currencies][0];
  return currency === 'INR' || !currency ? rupees(amount) : `${num(amount, 0)} ${currency}`;
};

const docsIn = (rows: SapDispatchRow[]) =>
  new Set(rows.map((r) => `${r.docType}|${r.docNo}`)).size;

/** One heading and its lines - a grade, or a customer. */
function Group({ label, rows, aside }: { label: string; rows: SapDispatchRow[]; aside?: string }) {
  const value = valueSaid(rows);
  return (
    <div className="effline">
      <div className="effname">
        <div>
          {label}
          <div className="muted text-[11px]">
            {rows.length} line{rows.length === 1 ? '' : 's'}
            {aside ? ` · ${aside}` : ''}
          </div>
        </div>
      </div>
      <div className="effnums">
        <b>{quantitySaid(rows)}</b>
        {value && <span className="efftarget">{value}</span>}
      </div>
    </div>
  );
}

export function SapDispatchBoard() {
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [data, setData] = useState<SapDispatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** '' is the whole window. A day narrows everything below it. */
  const [day, setDay] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    dispatchService
      .sap()
      .then((got) => live && (setData(got), setError('')))
      .catch((err) => live && setError(toRequestError(err).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [refreshTick]);

  const all = useMemo(() => data?.rows ?? [], [data]);

  /**
   * Every day that had a dispatch, newest first.
   *
   * Worked out before the filter is applied, so picking a day does not empty the
   * list you picked it from - which is the way a filter that narrows its own
   * picker traps somebody on one day with no way back.
   */
  const days = useMemo(() => {
    const map = new Map<string, SapDispatchRow[]>();
    for (const r of all) {
      const key = r.docDate ?? '';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map]
      .map(([date, rows]) => ({ date, rows }))
      .sort((a, b) => (a.date === '' ? 1 : b.date === '' ? -1 : b.date.localeCompare(a.date)));
  }, [all]);

  const rows = useMemo(() => (day ? all.filter((r) => r.docDate === day) : all), [all, day]);

  const byGrade = useMemo(() => {
    const map = new Map<string, SapDispatchRow[]>();
    for (const r of rows) map.set(r.grade ?? '', [...(map.get(r.grade ?? '') ?? []), r]);
    return [...map]
      .map(([grade, rs]) => ({ grade, rows: rs }))
      // An unmapped grade last: it is a thing to fix, not the headline.
      .sort((a, b) => (a.grade === '' ? 1 : b.grade === '' ? -1 : a.grade.localeCompare(b.grade)));
  }, [rows]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, SapDispatchRow[]>();
    for (const r of rows) {
      const key = r.customer ?? 'Not named';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    /* Biggest first: on a quarter's shipping, who matters is the question. */
    return [...map]
      .map(([customer, rs]) => ({ customer, rows: rs }))
      .sort(
        (a, b) =>
          b.rows.reduce((s, r) => s + r.quantity, 0) - a.rows.reduce((s, r) => s + r.quantity, 0),
      );
  }, [rows]);

  const documents = useMemo(() => {
    const map = new Map<string, SapDispatchRow[]>();
    for (const r of rows) {
      const key = `${r.docType}|${r.docNo}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()].sort((a, b) =>
      String(b[0]?.docDate ?? '').localeCompare(String(a[0]?.docDate ?? '')),
    );
  }, [rows]);

  if (loading && !data) return <div className="empty">Reading what has gone out…</div>;
  if (error) return <div className="errbox">Couldn’t read the dispatches: {error}</div>;

  /*
   * Nothing has landed, which is not the same as a plant that has shipped
   * nothing and must not be drawn as one.
   */
  if (!data?.sync) {
    return (
      <div className="empty">
        No dispatches have come from SAP yet. The sync on the plant server posts them once a day —
        until it has run, there is nothing here to show.
      </div>
    );
  }

  const window = data.sync.window;
  const showing = day ? dayLong(day) : 'the whole window';

  return (
    <>
      <div className="panel">
        <div className="kpis">
          <div className="kpi">
            <b>{quantitySaid(rows) || '—'}</b>
            <span>shipped</span>
          </div>
          <div className="kpi">
            <b>{valueSaid(rows) ?? '—'}</b>
            <span>invoiced</span>
          </div>
          <div className="kpi">
            <b>{docsIn(rows)}</b>
            <span>documents</span>
          </div>
          <div className="kpi">
            <b>{byCustomer.length}</b>
            <span>customers</span>
          </div>
        </div>

        <div className="sub mt-2">
          {/*
            The window the query covered, not the span the rows happen to fill.
            A quarter whose oldest row is three weeks old is either a quiet
            month or a query that silently narrowed, and only this tells the two
            apart. It stays on screen while a day is picked, so the day is
            always read against what it is a day out of.
          */}
          Showing <b>{showing}</b> ·{' '}
          {window?.from
            ? `read over ${dayLong(window.from)} to ${dayLong(window.to ?? '')}`
            : 'the window SAP was asked for'}
          {' · read '}
          {whenLast(data.sync.asOf)}
        </div>
        {data.totals.value == null && rows.length > 0 && (
          <div className="sub mt-1">
            No single total is shown: the lines carry more than one currency, or none carry a
            value. The documents below have what each was worth.
          </div>
        )}
      </div>

      <div className="grouphead">
        By day · {days.length} day{days.length === 1 ? '' : 's'} shipped
        {day && (
          <>
            {' · '}
            <button type="button" className="linkish" onClick={() => setDay('')}>
              show the whole window
            </button>
          </>
        )}
      </div>
      <div className="panel">
        {days.map(({ date, rows: dayRows }) => (
          /*
           * The day list is the answer to "when did we ship" before anything is
           * clicked, and the way into a single day. A row rather than a date
           * box: most days in a quarter had no dispatch at all, so a calendar
           * would mostly offer empty answers and give no clue which days are
           * worth opening.
           */
          <button
            key={date || 'undated'}
            type="button"
            className={cn('effline w-full text-left', day === date && 'miss')}
            onClick={() => setDay(day === date ? '' : date)}
            aria-pressed={day === date}
          >
            <div className="effname">
              <div>
                {date ? dayLong(date) : 'Not dated'}
                <div className="muted text-[11px]">
                  {docsIn(dayRows)} document{docsIn(dayRows) === 1 ? '' : 's'} ·{' '}
                  {new Set(dayRows.map((r) => r.customer ?? '')).size} customer
                  {new Set(dayRows.map((r) => r.customer ?? '')).size === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div className="effnums">
              <b>{quantitySaid(dayRows)}</b>
              {valueSaid(dayRows) && <span className="efftarget">{valueSaid(dayRows)}</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="grouphead">By grade · {showing}</div>
      <div className="panel">
        {byGrade.map(({ grade, rows: rs }) => (
          <Group key={grade || 'unmapped'} label={grade || 'Not mapped to a grade'} rows={rs} />
        ))}
      </div>

      <div className="grouphead">By customer · biggest first · {showing}</div>
      <div className="panel">
        {byCustomer.map(({ customer, rows: rs }) => (
          <Group
            key={customer}
            label={customer}
            rows={rs}
            aside={`${docsIn(rs)} documents`}
          />
        ))}
      </div>

      <div className="grouphead">
        Every document · newest first · {documents.length} of them
      </div>
      <div className="panel scroll-x mt-0 p-0">
        <table className="tt min-w-[640px]">
          <thead>
            <tr>
              <th>Document</th>
              <th>Customer</th>
              <th>What went</th>
              <th className="tnum">Quantity</th>
              <th className="tnum">Value</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((lines) => {
              const head = lines[0]!;
              return (
                <tr key={`${head.docType}|${head.docNo}`}>
                  <td>
                    <b>{head.docNo}</b>
                    <div className="muted text-[10px]">
                      {head.docDate ? dayLong(head.docDate) : 'not dated'}
                      {head.docType ? ` · ${head.docType}` : ''}
                    </div>
                  </td>
                  <td>
                    {head.customer ?? '—'}
                    {head.customerCode && (
                      <div className="muted text-[10px]">{head.customerCode}</div>
                    )}
                  </td>
                  <td>
                    {lines.map((l) => (
                      <div key={`${l.sku}|${l.lineNum ?? ''}|${l.batch ?? ''}`} className="text-[11px]">
                        <span className={cn(!l.grade && 'muted')}>
                          {l.grade ?? l.description ?? l.sku}
                        </span>
                        <span className="muted">
                          {' '}
                          {num(l.quantity, 0)} {l.unit}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="tnum">{quantitySaid(lines)}</td>
                  <td className="tnum">{valueSaid(lines) ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default SapDispatchBoard;
