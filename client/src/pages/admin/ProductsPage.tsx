import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { productService, type ProductPayload } from '@/api/services/product.service';
import { machineService } from '@/api/services/machine.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { DISPATCH_GRADES } from '@/config/constants';
import { useToast } from '@/hooks/useToast';
import type { Machine, Product } from '@/types/models';

/**
 * What the plant makes and sells.
 *
 * A product record has two halves. One is what it ships as: the code an order
 * names it by, the grade, the sack size and the machine it comes off. The other
 * is what a unit of it costs to make - material, firewood, power, labour and
 * machine time - which is what the costing works from.
 *
 * The curing settings underneath belong to the presses. They live on the product
 * rather than on the press because the same press moulds a different one
 * tomorrow, and neither the temperature nor the cycle is the press's to change;
 * a press run copies all four as it starts, so a rate changed here costs what is
 * moulded from now on and leaves the record alone.
 *
 * Every figure may be left blank. The plant has not measured all of them into
 * this system, and a placeholder would quietly cost every run wrong - so the
 * table says "not set" until somebody fills it in.
 */

/** The form holds everything as text; blank means "not measured yet". */
interface Draft {
  id: string | null;
  name: string;
  code: string;
  quality: string;
  packSizeKg: string;
  machineId: string;
  rawMaterialCost: string;
  firewoodCost: string;
  powerKwh: string;
  labourCost: string;
  machineHours: string;
  cureTempC: string;
  cyclicMin: string;
  cavities: string;
  compoundRate: string;
  note: string;
}

const blank: Draft = {
  id: null,
  name: '',
  code: '',
  quality: '',
  packSizeKg: '',
  machineId: '',
  rawMaterialCost: '',
  firewoodCost: '',
  powerKwh: '',
  labourCost: '',
  machineHours: '',
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
  code: p.code ?? '',
  quality: p.quality ?? '',
  packSizeKg: text(p.pack_size_kg),
  machineId: p.machine_id ?? '',
  rawMaterialCost: text(p.raw_material_cost),
  firewoodCost: text(p.firewood_cost),
  powerKwh: text(p.power_kwh),
  labourCost: text(p.labour_cost),
  machineHours: text(p.machine_hours),
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

/** What a unit of this costs, where enough of it has been measured to say. */
const unitCost = (p: Product) => {
  const parts = [p.raw_material_cost, p.firewood_cost, p.labour_cost];
  if (parts.every((value) => value == null)) return null;
  return parts.reduce((sum: number, value) => sum + Number(value ?? 0), 0);
};

export function ProductsPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [rows, setRows] = useState<Product[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, machineList] = await Promise.all([
        productService.list({ limit: 100, order: 'asc' }),
        machineService.list({ limit: 200, order: 'asc' }),
      ]);
      setRows(products.rows);
      setMachines(machineList.rows);
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
      code: draft.code.trim().toUpperCase() || null,
      quality: draft.quality || null,
      packSizeKg: asNumber(draft.packSizeKg),
      machineId: draft.machineId || null,
      rawMaterialCost: asNumber(draft.rawMaterialCost),
      firewoodCost: asNumber(draft.firewoodCost),
      powerKwh: asNumber(draft.powerKwh),
      labourCost: asNumber(draft.labourCost),
      machineHours: asNumber(draft.machineHours),
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

  const field = (
    id: string,
    label: string,
    unit: string | null,
    key: keyof Draft,
    hint?: string,
    numeric = true,
  ) => (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit && <span className="muted font-normal"> ({unit})</span>}
      </label>
      <input
        id={id}
        {...(numeric ? { type: 'number', inputMode: 'decimal' as const } : {})}
        placeholder="—"
        value={draft?.[key] ?? ''}
        onChange={(e) => draft && setDraft({ ...draft, [key]: e.target.value })}
      />
      {hint && <div className="sub mt-1">{hint}</div>}
    </div>
  );

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Products</h1>
        <div className="sub">
          What the plant makes and sells: the code an order names it by, the grade and sack size it
          ships in, the machine it comes off, and what a unit of it costs to make. The curing
          settings underneath belong to the presses — a press run copies them as it starts, so a
          change here costs what is moulded from now on and leaves the record alone.
        </div>
      </div>

      {loading && <div className="spin">Loading products…</div>}

      {!loading && !rows.length && (
        <div className="empty">
          Nothing on the product list yet. A press cannot start a run until there is something for it
          to mould.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="scroll-x mt-3">
          <table className="hist">
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Quality</th>
                <th className="text-right">Pack</th>
                <th>Machine</th>
                <th className="text-right">Unit cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => {
                const cost = unitCost(product);
                return (
                  <tr key={product.id}>
                    <td>{product.code ?? <span className="muted">—</span>}</td>
                    <td>
                      <b>{product.name}</b>
                      {!product.active && <span className="badge none ml-1.5">retired</span>}
                    </td>
                    <td>{product.quality ?? <span className="muted">—</span>}</td>
                    <td className="text-right">{show(product.pack_size_kg, 'kg')}</td>
                    <td>{product.machine_id ?? <span className="muted">—</span>}</td>
                    <td className="text-right">
                      {cost == null ? <span className="muted">not costed</span> : `Rs ${cost}`}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setDraft(draftOf(product))}
                      >
                        Edit
                      </button>{' '}
                      <button type="button" className="btn ghost" onClick={() => void retire(product)}>
                        {product.active ? 'Retire' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="btn block mt-2.5" onClick={() => setDraft({ ...blank })}>
        + Add product
      </button>

      <BoModal
        open={Boolean(draft)}
        title={draft?.id ? `Edit ${draft.name}` : 'New product'}
        subtitle="Leave a figure blank until it has been measured — the costing then leaves it out rather than working from a guess."
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
              <label htmlFor="p-code">Code</label>
              <input
                id="p-code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              />
              <div className="sub mt-1">Unique across the list — this is what an order is matched on.</div>
            </div>
            <div className="field">
              <label htmlFor="p-quality">Quality</label>
              <select
                id="p-quality"
                value={draft.quality}
                onChange={(e) => setDraft({ ...draft, quality: e.target.value })}
              >
                <option value="">Not set</option>
                {DISPATCH_GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </div>
            {field('p-pack', 'Pack size', 'kg', 'packSizeKg', 'What one sack of this holds.')}
            <div className="field">
              <label htmlFor="p-machine">Machine</label>
              <select
                id="p-machine"
                value={draft.machineId}
                onChange={(e) => setDraft({ ...draft, machineId: e.target.value })}
              >
                <option value="">Not set</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name} ({machine.id})
                  </option>
                ))}
              </select>
              <div className="sub mt-1">Which machine this comes off. Left unset for anything that is not made on one.</div>
            </div>

            <div className="sheet-label mt-3">What a unit costs</div>
            {field('p-rm', 'Raw material', 'Rs', 'rawMaterialCost')}
            {field('p-fw', 'Firewood', 'Rs', 'firewoodCost')}
            {field('p-kwh', 'Power', 'kWh', 'powerKwh', 'Costed at the electricity rate on the Rates tab.')}
            {field('p-lab', 'Labour', 'Rs', 'labourCost')}
            {field('p-mh', 'Machine hours', 'h', 'machineHours')}

            <div className="sheet-label mt-3">Press settings</div>
            {field('p-temp', 'Curing temperature', '°C', 'cureTempC', 'Shown at the press as a fact of the product, never typed there.')}
            {field('p-cycle', 'Cyclic time', 'min', 'cyclicMin', 'Pre-filled at the run, and editable for that run alone.')}
            {field('p-cav', 'Cavities', null, 'cavities', 'How many pieces the mould makes per cycle.')}
            {field(
              'p-rate',
              'Compound rate',
              'Rs/kg',
              'compoundRate',
              'Charged on the weight moulded plus the flash trimmed off it.',
            )}

            {field('p-note', 'Note', null, 'note', undefined, false)}
          </div>
        )}
      </BoModal>
    </>
  );
}

export default ProductsPage;
