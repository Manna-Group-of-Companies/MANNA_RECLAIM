import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { customerService } from '@/api/services/customer.service';
import { toRequestError } from '@/api/axiosClient';
import { QualityChip } from '@/components/ui';
import { adminPaths } from '@/config/paths';
import { useToast } from '@/hooks/useToast';
import { rupees } from '@/utils/format';
import type { Customer, DispatchDoc } from '@/types/models';

/**
 * One customer's record: what has gone out to them, newest first.
 *
 * A row is the document - the day, the sacks split by grade, what the transport
 * was charged at, the total. The lines underneath are what it was actually made
 * of, and they are collapsed by default because most of the time the question is
 * "what went out in August", not "which pallet".
 *
 * There is no edit here, and no route behind one. A dispatch is written once; a
 * correction is a reversal document and a fresh dispatch, so this page is a
 * ledger rather than a form.
 */

const dateLabel = (iso?: string | null) => (iso ? iso : '—');

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

  const sacksLine = (doc: DispatchDoc) => {
    const byQuality = doc.sacks_by_quality ?? {};
    const parts = Object.entries(byQuality);
    if (!parts.length) return `${doc.sacks} sacks`;
    return parts.map(([quality, count]) => `${count} × ${quality}`).join(' · ');
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
                      <th className="text-right">Sacks</th>
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
                        <td className="text-right">{line.sacks}</td>
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
