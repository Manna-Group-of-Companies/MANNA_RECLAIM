import { Fragment, useCallback, useEffect, useState } from 'react';
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
  /**
   * How a moulded product is boxed, and what one piece weighs.
   *
   * `packSizeKg` above is the other thing - what a sack of a reclaim grade
   * weighs. A moulded product is not sold by weight at all: it is sold by the
   * piece, boxed some number at a time, and the yard keys its stock on the
   * product and that pack. Left blank the presses still run and the yard shows
   * the pieces as boxed loose - which is what gets somebody to come and fill
   * this in - and moulded stock reports no weight rather than a guessed one.
   */
  packSize: string;
  packLabel: string;
  pieceKg: string;
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
  /**
   * Whether the item is moulded at all. Cavities and a cycle time are facts
   * about a mould, so an item that is cut or assembled has neither - and the
   * sleeve and loop run sheets then ask for neither.
   */
  moulded: boolean;
  note: string;
}

const blank: Draft = {
  id: null,
  name: '',
  code: '',
  quality: '',
  packSizeKg: '',
  packSize: '',
  packLabel: '',
  pieceKg: '',
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
  // A new product is assumed to be moulded: everything on the list today is.
  moulded: true,
  note: '',
};

/** The draft fields that are typed into a text box, as against ticked. */
type TextKey = {
  [K in keyof Draft]: Draft[K] extends string ? K : never;
}[keyof Draft];

const text = (value: number | null | undefined) => (value == null ? '' : String(value));

const draftOf = (p: Product): Draft => ({
  id: p.id,
  name: p.name,
  code: p.code ?? '',
  quality: p.quality ?? '',
  packSizeKg: text(p.pack_size_kg),
  packSize: text(p.pack_size),
  packLabel: p.pack_label ?? '',
  pieceKg: text(p.piece_kg),
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
  // Absent reads as moulded: the column defaults true, and every row written
  // before it existed was something a press moulds.
  moulded: p.moulded !== false,
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
  /**
   * Which product's Retire is armed, and which one is in flight.
   *
   * Retiring is the one control on this page that takes something away, and it
   * went through on the first click while every other taking-away in this app -
   * a run, a test, an empty stock group - asks once and says what it is about
   * to do. A row of buttons where the harmless one and the destructive one
   * behave identically is how the wrong one gets pressed.
   *
   * Restoring is not armed: putting a product back on the list is undone by
   * pressing the same button again.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);

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
      packSize: asNumber(draft.packSize),
      packLabel: draft.packLabel.trim() || null,
      pieceKg: asNumber(draft.pieceKg),
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
      moulded: draft.moulded,
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
    setRetiring(product.id);
    try {
      if (product.active) await productService.retire(product.id);
      else await productService.update(product.id, { active: true });
      notify(product.active ? 'Product retired' : 'Product back on the list');
      setConfirming(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setRetiring(null);
    }
  };

  const field = (
    id: string,
    label: string,
    unit: string | null,
    // The typed fields only. `moulded` is a checkbox and `id` is not edited, so
    // neither goes through this helper - and narrowing the key here is what
    // stops one being handed to it by accident.
    key: TextKey,
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
                  <Fragment key={product.id}>
                    <tr>
                      <td>{product.code ?? <span className="muted">—</span>}</td>
                      <td>
                        <b>{product.name}</b>
                        {!product.active && <span className="badge none ml-1.5">retired</span>}
                      </td>
                      <td>{product.quality ?? <span className="muted">—</span>}</td>
                      {/* A moulded product ships by the piece and a reclaim grade
                          by the sack, so whichever pack it actually has is the
                          one shown rather than a column of "not set". */}
                      <td className="text-right">
                        {product.pack_size != null
                          ? `${product.pack_size} pcs`
                          : show(product.pack_size_kg, 'kg')}
                      </td>
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
                        {confirming === product.id ? (
                          <>
                            <button
                              type="button"
                              className="btn danger"
                              onClick={() => void retire(product)}
                              disabled={retiring === product.id}
                            >
                              {retiring === product.id ? 'Retiring…' : 'Yes, retire'}
                            </button>{' '}
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setConfirming(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              product.active ? setConfirming(product.id) : void retire(product)
                            }
                            title={
                              product.active
                                ? 'Take it off the pick lists — the runs that named it keep it'
                                : 'Put it back on the pick lists'
                            }
                          >
                            {product.active ? 'Retire' : 'Restore'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Said beside the armed button rather than only in the toast
                        afterwards: what a retire does not do is the part somebody
                        hesitating over it is least likely to know. */}
                    {confirming === product.id && (
                      <tr>
                        <td colSpan={7} className="sub">
                          {product.name} leaves the pick lists at the presses and the benches. Every
                          run that already moulded it keeps its name and its costing, and Restore puts
                          it back.
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
              <div className="sub mt-1">
                Unique across the list — this is what an order is matched on. A sleeve or loop
                batch number no longer uses it: a lot is named by the shift it was made on,{' '}
                <b>03/Aug/26-day</b>, with the product beside it. So a product with no code can
                still be made and still be sold; it is the order that will not match.
              </div>
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

            {/*
              The moulded half. Filled in for anything a press makes and left
              blank for anything it does not - a reclaim grade has no pieces to
              count, so these three simply do not apply to it.
            */}
            {field(
              'p-packsize',
              'Pieces per pack',
              null,
              'packSize',
              'How many pieces go in one box. The yard keys moulded stock on the product and this, so LOOP boxed fifty at a time is LOOP-50. Blank means the pieces are counted loose and the Stock page says so.',
            )}
            {field(
              'p-packlabel',
              'Pack called',
              null,
              'packLabel',
              'What the floor calls the box — “bag of 50”. Cosmetic; the count above is what the yard files on.',
              false,
            )}
            {field(
              'p-piecekg',
              'One piece weighs',
              'kg',
              'pieceKg',
              'What the yard puts a weight against moulded stock with, and what a moulded load is costed by on the weighbridge. Blank and it reports no weight rather than a guessed one.',
            )}
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
            {/*
              Whether it is moulded at all.

              Cavities and a cycle time are facts about a mould, so an item that
              is cut or assembled rather than moulded has neither - and the
              sleeve and loop run sheets then ask for neither, and report no
              expected piece count, because there is no cycle to work one out
              from. A checkbox rather than one of the numeric fields above: it is
              a yes or no about the item, not a figure somebody measures.
            */}
            <div className="field">
              <label htmlFor="p-moulded">Moulded</label>
              <input
                id="p-moulded"
                type="checkbox"
                checked={draft.moulded}
                onChange={(e) => setDraft({ ...draft, moulded: e.target.checked })}
              />
              <div className="sub mt-1">
                Off for anything cut or assembled rather than moulded. The two settings below are
                then not asked for at the run, and there is no expected piece count to compare a
                shift against.
              </div>
            </div>
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
