import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { customerService } from '@/api/services/customer.service';
import { toRequestError } from '@/api/axiosClient';
import { QualityChip } from '@/components/ui';
import { adminPaths } from '@/config/paths';
import { counted } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import { rupees } from '@/utils/format';
import type { Customer, DispatchDoc } from '@/types/models';

/**
 * One customer's record: what has gone out to them, newest first.
 *
 * This is the only place a past dispatch is read. There is no standalone
 * dispatch history view, by design - the question anyone actually asks is what
 * a given customer has bought, so it is answered off the customer rather than
 * off a ledger that would have to be filtered back down to one every time.
 *
 * A row is the document - the day, the sacks split by grade, what the transport
 * was charged at, the total. The lines underneath are what it was actually made
 * of, and they are collapsed by default because most of the time the question is
 * "what went out in August", not "which pallet".
 *
 * Under the lines is what the load cost to serve. Loading is a cost to us and
 * never a charge to the customer, so it sits below the total rather than inside
 * it - and it is not in the rupees-per-kg the reclaim carries either, which is
 * frozen at the batch. One loading job covers the whole truck, so the server
 * splits it back across the lines by kg before any single grade's share of it
 * can be read.
 *
 * There is no edit here, and no route behind one. A dispatch is written once; a
 * correction is a reversal document and a fresh dispatch, so this page is a
 * ledger rather than a form.
 */

const dateLabel = (iso?: string | null) => (iso ? iso : '—');

/** How the crew that loaded this vehicle was paid, in the words to say it in. */
const MODE_LABEL: Record<string, string> = {
  contract: 'contract',
  manhour: 'daily wage',
  mixed: 'contract + daily wage',
};

/** The arithmetic behind a loading cost, so a figure nobody can check is not shown. */
const loadingWorking = (doc: DispatchDoc): string | null => {
  const loading = doc.loading;
  if (!loading) return null;
  const parts: string[] = [];
  if (loading.contract_cost > 0) {
    parts.push(`${loading.kg_loaded} kg × ${rupees(loading.contract_rate_per_kg)}/kg`);
  }
  if (loading.manhour_cost > 0) {
    parts.push(
      `${loading.manhour_labourers} × ${loading.manhour_hours} h × ${rupees(loading.daily_labour_rate)}/hr`,
    );
  }
  return parts.length ? parts.join('  +  ') : null;
};

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [rows, setRows] = useState<DispatchDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [record, history] = await Promise.all([
        customerService.getOne(id),
        customerService.dispatches(id, { limit: 100 }),
      ]);
      setCustomer(history.customer ?? record);
      setRows(history.rows);
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  /**
   * What went out on this document.
   *
   * Split by quality where the lines say so, which is nearly always - "3 ×
   * Fine · 2 × LOOP" tells the office what left, and a bare total does not.
   * The fallback names its units rather than saying "sacks", because a document
   * can now carry moulded goods counted by the piece.
   */
  const sacksLine = (doc: DispatchDoc) => {
    const byQuality = doc.sacks_by_quality ?? {};
    const parts = Object.entries(byQuality);
    if (parts.length) return parts.map(([quality, count]) => `${count} × ${quality}`).join(' · ');
    return (
      [
        doc.sacks ? counted(doc.sacks, 'sacks') : null,
        doc.pieces ? counted(doc.pieces, 'pieces') : null,
      ]
        .filter(Boolean)
        .join(' · ') || counted(0, 'sacks')
    );
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <div className="sub">
          <Link to={adminPaths.customers}>← Customers</Link>
        </div>
        <h1 className="text-lg">{customer?.name ?? 'Customer'}</h1>
        <div className="sub">
          {customer?.phone || <span className="muted">no phone</span>}
          {customer?.address ? ` · ${customer.address}` : ''}
        </div>
      </div>

      <div className="mx-0.5 mt-3">
        <h2 className="text-base">Dispatches</h2>
        <div className="sub">
          {rows.length
            ? `${rows.length} on record · ${rupees(rows.reduce((sum, doc) => sum + doc.total, 0))} in total`
            : 'Nothing has gone out to this customer yet.'}
        </div>
      </div>

      {loading && <div className="spin">Loading dispatches…</div>}

      {!loading && !rows.length && (
        <div className="empty">
          No dispatches on record. One posted from the Stock tab appears here with the lines it was
          made of.
        </div>
      )}

      {!loading &&
        rows.map((doc) => (
          <div key={doc.id} className="mrow flex-col items-stretch">
            <button
              type="button"
              className="row w-full items-start justify-between gap-2 text-left"
              onClick={() => setOpen((current) => ({ ...current, [doc.id]: !current[doc.id] }))}
              aria-expanded={Boolean(open[doc.id])}
            >
              <div>
                <div className="mn">{dateLabel(doc.dispatch_date)}</div>
                <div className="mk">
                  {sacksLine(doc)}
                  {' · '}
                  {doc.transport_provided
                    ? `transport ${rupees(doc.transport_charge)}`
                    : 'customer’s own transport'}
                </div>
                {/* A load with no labour recorded at all. Sometimes true - the
                    customer's own crew loaded their own vehicle - and sometimes
                    a form somebody tabbed through, and the two are
                    indistinguishable afterwards unless the gap is on the row. */}
                {!doc.labour_recorded && (
                  <div className="mk warn">⚠ no loading labour recorded</div>
                )}
                {doc.remarks && <div className="mk">{doc.remarks}</div>}
              </div>
              <div className="text-right">
                <div className="mn">{rupees(doc.total)}</div>
                <div className="mk">{open[doc.id] ? 'hide lines ▴' : 'show lines ▾'}</div>
              </div>
            </button>

            {open[doc.id] && (
              <div className="scroll-x mt-2.5">
                <table className="hist">
                  <thead>
                    <tr>
                      <th>Stock</th>
                      <th>Quality</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Unit price</th>
                      <th className="text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.label ?? <span className="muted">—</span>}</td>
                        <td>
                          {line.quality ? (
                            <QualityChip quality={line.quality} />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        {/* With its unit. A line of 500 under a "Sacks" column
                            is a wrong reading of a moulded line, and the number
                            alone gives no way to notice. */}
                        <td className="text-right">
                          {counted(line.qty ?? line.sacks, line.unit ?? 'sacks')}
                        </td>
                        <td className="text-right">{rupees(line.unit_price)}</td>
                        <td className="text-right">{rupees(line.line_total)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="text-right">
                        Goods
                      </td>
                      <td className="text-right">{rupees(doc.goods_total)}</td>
                    </tr>
                    {doc.transport_provided && (
                      <tr>
                        <td colSpan={4} className="text-right">
                          Transport
                        </td>
                        <td className="text-right">{rupees(doc.transport_charge)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="text-right">
                        <b>Total</b>
                      </td>
                      <td className="text-right">
                        <b>{rupees(doc.total)}</b>
                      </td>
                    </tr>

                    {/* Below the total, not inside it. What it cost us to put
                        this load on a truck is not something the customer is
                        being charged - and it is not in the reclaim's own
                        ₹/kg either, which was frozen at the batch. */}
                    <tr>
                      <td colSpan={4} className="text-right">
                        Loading
                        {doc.loading ? (
                          <span className="muted">
                            {' '}
                            · {MODE_LABEL[doc.loading.loading_mode] ?? doc.loading.loading_mode}
                            {loadingWorking(doc) ? ` · ${loadingWorking(doc)}` : ''}
                          </span>
                        ) : (
                          <span className="muted"> · nothing recorded</span>
                        )}
                      </td>
                      <td className="text-right">
                        {doc.loading ? rupees(doc.loading_cost ?? 0) : <span className="muted">—</span>}
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={4} className="text-right">
                        <b>After cost to serve</b>
                        <span className="muted"> · goods less loading and transport</span>
                      </td>
                      <td className="text-right">
                        <b>{rupees(doc.contribution ?? doc.goods_total)}</b>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
    </>
  );
}

export default CustomerDetailPage;
