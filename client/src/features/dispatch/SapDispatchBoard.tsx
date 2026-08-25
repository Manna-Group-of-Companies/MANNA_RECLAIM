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
 * Read three ways down the page, because "what have we been shipping" is really
 * three questions and they have different answers: how much and what it came to,
 * which grades it went out as, and who bought it. The documents themselves are
 * last - they are the evidence rather than the answer.
 *
 * Every figure here is a line off a document, never an aggregate SAP was asked
 * for. That is what lets the page show a total and then explain it; a feed that
 * arrived pre-totalled would make every disagreement between the two systems
 * unanswerable.
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

  const rows = useMemo(() => data?.rows ?? [], [data]);

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
            <b>{data.totals.documents}</b>
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
            apart.
          */}
          {window?.from ? `${dayLong(window.from)} to ${dayLong(window.to ?? '')}` : 'the window SAP was asked for'}
          {' · read '}
          {whenLast(data.sync.asOf)}
          {' · '}
          {data.totals.rows} lines off {data.totals.documents} documents
        </div>
        {data.totals.value == null && rows.length > 0 && (
          <div className="sub mt-1">
            No single total is shown: the lines carry more than one currency, or none carry a
            value. The documents below have what each was worth.
          </div>
        )}
      </div>

      <div className="grouphead">By grade</div>
      <div className="panel">
        {byGrade.map(({ grade, rows: rs }) => (
          <Group key={grade || 'unmapped'} label={grade || 'Not mapped to a grade'} rows={rs} />
        ))}
      </div>

      <div className="grouphead">By customer · biggest first</div>
      <div className="panel">
        {byCustomer.map(({ customer, rows: rs }) => (
          <Group
            key={customer}
            label={customer}
            rows={rs}
            aside={`${new Set(rs.map((r) => `${r.docType}|${r.docNo}`)).size} documents`}
          />
        ))}
      </div>

      <div className="grouphead">Every document · newest first</div>
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
                      <div key={`${l.sku}|${l.batch ?? ''}`} className="text-[11px]">
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
