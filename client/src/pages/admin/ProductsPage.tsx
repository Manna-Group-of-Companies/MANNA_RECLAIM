import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { productService, type ProductPayload } from '@/api/services/product.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import type { Product } from '@/types/models';

/**
 * What the presses mould, and what each is moulded at.
 *
 * These settings live on the product rather than on the press because the same
 * press moulds a different one tomorrow, and neither the temperature nor the
 * cycle is the press's to change - so the floor never retypes them, and never
 * gets them wrong. The compound rate is what a press run's material cost is
 * worked out against; a run copies all four as it starts, so a rate changed here
 * costs what is moulded from now on and leaves the record alone.
 */

/** The form holds everything as text; blank means "not measured yet". */
interface Draft {
  id: string | null;
  name: string;
  cureTempC: string;
  cyclicMin: string;
  cavities: string;
  compoundRate: string;
  note: string;
}

const blank: Draft = {
  id: null,
  name: '',
  cureTempC: '',
  cyclicMin: '',
  cavities: '',
  compoundRate: '',
  note: '',
};

const text = (value: number | null | undefined) => (value == null ? '' : String(value));

const draftOf = (p: Product): Draft => ({
  id: p.id,
  name: p.name,
  cureTempC: text(p.cure_temp_c),
  cyclicMin: text(p.cyclic_min),
  cavities: text(p.cavities),
  compoundRate: text(p.compound_rate),
  note: p.note ?? '',
});

/** Blank clears the figure rather than sending a zero the costing would use. */
const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
};

const show = (value: number | null | undefined, unit: string) =>
  value == null ? <span className="muted">not set</span> : `${value} ${unit}`;

export function ProductsPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await productService.list({ limit: 100, order: 'asc' })).rows);
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
    if (!draft.name.trim()) {
      notify('A product name is needed', 'warn');
      return;
    }
    const payload: ProductPayload = {
      name: draft.name.trim(),
      cureTempC: asNumber(draft.cureTempC),
      cyclicMin: asNumber(draft.cyclicMin),
      cavities: asNumber(draft.cavities),
      compoundRate: asNumber(draft.compoundRate),
      note: draft.note.trim() || null,
    };
    setSaving(true);
    try {
      if (draft.id) await productService.update(draft.id, payload);
      else await productService.create(payload);
      notify(draft.id ? 'Product updated' : 'Product added');
      setDraft(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Retired, not deleted: the press runs that moulded it name it, and their
   * material cost reads the rate off those rows.
   */
  const retire = async (product: Product) => {
    try {
      if (product.active) await productService.retire(product.id);
      else await productService.update(product.id, { active: true });
      notify(product.active ? 'Product retired' : 'Product back on the list');
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    }
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Products</h1>
        <div className="sub">
          What the moulding presses mould. The curing settings belong to the product, not to the
          press, so the floor never retypes them — and the compound rate here is what a press run's
          material cost is worked out against.
        </div>
      </div>

      {loading && <div className="spin">Loading products…</div>}

      {!loading && !rows.length && (
        <div className="empty">
          Nothing on the product list yet. A press cannot start a run until there is something for it
          to mould.
        </div>
      )}

      {!loading &&
        rows.map((product) => (
          <div key={product.id} className="mrow">
            <div>
              <div className="mn">{product.name}</div>
              <div className="mk">
                {show(product.cure_temp_c, '°C')} · {show(product.cyclic_min, 'min')} ·{' '}
                {product.cavities == null ? <span className="muted">cavities not set</span> : `${product.cavities} cavities`}{' '}
                · {product.compound_rate == null ? <span className="muted">no rate</span> : `₹${product.compound_rate}/kg`}
              </div>
            </div>
            <div className="row gap-2">
              <span className={`badge ${product.active ? 'ok' : 'none'}`}>
                {product.active ? 'in use' : 'retired'}
              </span>
              <button type="button" className="btn ghost" onClick={() => setDraft(draftOf(product))}>
                Edit
              </button>
              <button type="button" className="btn ghost" onClick={() => void retire(product)}>
                {product.active ? 'Retire' : 'Restore'}
              </button>
            </div>
          </div>
        ))}

      <button type="button" className="btn block mt-2.5" onClick={() => setDraft({ ...blank })}>
        + Add product
      </button>

      <BoModal
        open={Boolean(draft)}
        title={draft?.id ? `Edit ${draft.name}` : 'New product'}
        subtitle="Leave a figure blank until it has been measured — a press run then logs without it rather than against a guess."
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : draft?.id ? 'Save changes' : 'Add product'}
          </button>
        }
      >
        {draft && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="p-name">Name</label>
              <input
                id="p-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="p-temp">
                Curing temperature <span className="muted font-normal">(°C)</span>
              </label>
              <input
                id="p-temp"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.cureTempC}
                onChange={(e) => setDraft({ ...draft, cureTempC: e.target.value })}
              />
              <div className="sub mt-1">Shown at the press as a fact of the product, never typed there.</div>
            </div>
            <div className="field">
              <label htmlFor="p-cycle">
                Cyclic time <span className="muted font-normal">(min)</span>
              </label>
              <input
                id="p-cycle"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.cyclicMin}
                onChange={(e) => setDraft({ ...draft, cyclicMin: e.target.value })}
              />
              <div className="sub mt-1">Pre-filled at the run, and editable for that run alone.</div>
            </div>
            <div className="field">
              <label htmlFor="p-cav">Cavities</label>
              <input
                id="p-cav"
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={draft.cavities}
                onChange={(e) => setDraft({ ...draft, cavities: e.target.value })}
              />
              <div className="sub mt-1">How many pieces the mould makes per cycle.</div>
            </div>
            <div className="field">
              <label htmlFor="p-rate">
                Compound rate <span className="muted font-normal">(₹/kg)</span>
              </label>
              <input
                id="p-rate"
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft.compoundRate}
                onChange={(e) => setDraft({ ...draft, compoundRate: e.target.value })}
              />
              <div className="sub mt-1">
                Charged on the weight moulded plus the flash trimmed off it. A run started before this
                is set keeps costing nothing — it was moulded without a rate on record.
              </div>
            </div>
            <div className="field">
              <label htmlFor="p-note">Note</label>
              <input
                id="p-note"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
          </div>
        )}
      </BoModal>
    </>
  );
}

export default ProductsPage;
