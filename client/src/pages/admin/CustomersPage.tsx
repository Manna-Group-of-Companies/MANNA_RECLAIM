import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { customerService, type CustomerPayload } from '@/api/services/customer.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { adminPaths } from '@/config/paths';
import { useToast } from '@/hooks/useToast';
import type { Customer } from '@/types/models';

/**
 * Who the plant sells to.
 *
 * Manager and admin only, and enforced on the route rather than here: the whole
 * /customers file on the server is behind the same guard, so a supervisor who
 * typed the address gets a 403 and not an empty page.
 */

interface Draft {
  id: string | null;
  name: string;
  phone: string;
  address: string;
  region: string;
}

const blank: Draft = { id: null, name: '', phone: '', address: '', region: '' };

const draftOf = (customer: Customer): Draft => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone ?? '',
  address: customer.address ?? '',
  region: customer.region ?? '',
});

export function CustomersPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (term = '') => {
      setLoading(true);
      try {
        const res = term.trim()
          ? await customerService.search(term.trim())
          : await customerService.list({ limit: 200, order: 'asc' });
        setRows(res.rows);
      } catch (err) {
        notify(toRequestError(err).message, 'err');
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      notify('A customer name is needed', 'warn');
      return;
    }
    const payload: CustomerPayload = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      region: draft.region.trim() || null,
    };
    setSaving(true);
    try {
      if (draft.id) await customerService.update(draft.id, payload);
      else await customerService.create(payload);
      notify(draft.id ? 'Customer updated' : 'Customer added');
      setDraft(null);
      void load(search);
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Customers</h1>
        <div className="sub">
          Who the plant sells to. Open one to see what has gone out to them, at what price, and what
          the transport was charged at.
        </div>
      </div>

      <div className="field mt-3">
        <label htmlFor="cust-search">Search</label>
        <input
          id="cust-search"
          value={search}
          placeholder="Name…"
          onChange={(e) => {
            setSearch(e.target.value);
            void load(e.target.value);
          }}
        />
      </div>

      {loading && <div className="spin">Loading customers…</div>}

      {!loading && !rows.length && (
        <div className="empty">
          {search.trim() ? 'Nobody by that name.' : 'No customers on the list yet.'}
        </div>
      )}

      {!loading &&
        rows.map((customer) => (
          <div key={customer.id} className="mrow">
            <div>
              <div className="mn">{customer.name}</div>
              <div className="mk">
                {customer.phone || <span className="muted">no phone</span>}
                {customer.address ? ` · ${customer.address}` : ''}
                {customer.region ? ` · ${customer.region}` : ''}
              </div>
            </div>
            <div className="row gap-2">
              {!customer.active && <span className="badge none">inactive</span>}
              <Link className="btn ghost" to={adminPaths.customer(customer.id)}>
                Open
              </Link>
              <button type="button" className="btn ghost" onClick={() => setDraft(draftOf(customer))}>
                Edit
              </button>
            </div>
          </div>
        ))}

      <button type="button" className="btn block mt-2.5" onClick={() => setDraft({ ...blank })}>
        + Add customer
      </button>

      <BoModal
        open={Boolean(draft)}
        title={draft?.id ? `Edit ${draft.name}` : 'New customer'}
        subtitle="The name is what the rate card is keyed on, so a customer already on the rate card is already here."
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : draft?.id ? 'Save changes' : 'Add customer'}
          </button>
        }
      >
        {draft && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input
                id="c-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Phone</label>
              <input
                id="c-phone"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-address">Address</label>
              <input
                id="c-address"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-region">Region</label>
              <input
                id="c-region"
                value={draft.region}
                onChange={(e) => setDraft({ ...draft, region: e.target.value })}
              />
            </div>
          </div>
        )}
      </BoModal>
    </>
  );
}

export default CustomersPage;
