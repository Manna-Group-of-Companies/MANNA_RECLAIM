import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BottomSheet,
  Button,
  FieldRow,
  FormWarning,
  QualityChip,
  Readout,
  SelectField,
  SheetLabel,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { customerService } from '@/api/services/customer.service';
import { rateService } from '@/api/services/rate.service';
import { dispatchService, type DispatchPayload } from '@/api/services/dispatch.service';
import { toRequestError } from '@/api/axiosClient';
import { useToast } from '@/hooks/useToast';
import { SACK_KG, UNIT_NOUN, counted } from '@/config/constants';
import { todayISO } from '@/utils/date';
import { rupees } from '@/utils/format';
import type {
  Customer,
  DispatchGrade,
  LoadingMaterial,
  LoadingMode,
  QcStatus,
  StockUnit,
} from '@/types/models';

/**
 * Issuing a dispatch, from the Stock view.
 *
 * The header says who it is going to and on what day, and whether we carried
 * it; the lines say what came off which stock group and how many sacks. Only
 * groups with sacks left and a QC pass can be picked - the rest are on the
 * screen behind this sheet with the reason they cannot be loaded, which is a
 * different thing from being hidden.
 *
 * Two parts are worth reading closely.
 *
 * The price is per quality, not per line. A customer is quoted a rate for Fine
 * and every sack of Fine on the document goes at it, so the prices sit in their
 * own block keyed on the qualities the lines actually add up to. That block
 * grows and shrinks as stock is picked, and the sheet will not submit while any
 * of it is blank: a quality left unpriced is the load that goes out at last
 * quarter's figure and is noticed on the invoice.
 *
 * The loading job is costed here rather than remembered to be entered later.
 * Its "daily labour on this load?" section is always shown, on every load,
 * including a contract one - because the rule is that any day-labour worker's
 * time is accounted in man-hours wherever they worked, and a section that only
 * appears once someone has chosen the right mode is a section nobody finds. If
 * anyone is entered there on a contract load the mode becomes `mixed`, and that
 * happens on the server whatever this form sends.
 *
 * Submit posts once and is disabled while in flight. The whole document is one
 * transaction on the server, so a 409 - another vehicle took the sacks first,
 * or the group is on hold - means nothing was written, and the message names
 * the group so it can be shown against the line that caused it.
 */

interface Line {
  /** Local key. The line has no id until the document is posted. */
  key: number;
  stockGroupId: string;
  /** The count going out, in the group's own unit - sacks or pieces. */
  qty: string;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * What the sheet needs off a stock group, and no more.
 *
 * A `StockGroup` satisfies this as it stands. Kept as its own shape so the
 * sheet cannot come to depend on the commercial half of that row - what was
 * packed and what has already gone - which is the back office's reconciliation
 * and none of this form's business.
 */
export interface DispatchableStock {
  id: string;
  display_label: string;
  quality: DispatchGrade | null;
  /**
   * What this group is counted in, and how much of it is left. Reclaim and
   * coarse are sacks; what the presses moulded is pieces. Nothing in this sheet
   * prints a quantity without the unit beside it, because a moulded pallet shown
   * as sacks is a price per sack typed against goods sold by the piece.
   */
  unit: StockUnit;
  available_qty: number;
  /** Pieces to a pack, so the picker can say how many boxes that is. */
  pack_size?: number | null;
  /** The older name for `available_qty`, kept while callers catch up. */
  available_sacks: number;
  qc_status: QcStatus;
}

export interface NewDispatchSheetProps {
  open: boolean;
  /** Every group in the yard - the sheet decides which of them can be picked. */
  groups: DispatchableStock[];
  /**
   * The group to arrive on, when the sheet was opened from a row rather than
   * from the header. Null opens on an empty picker, which is what loading a
   * vehicle off several groups starts from.
   */
  initialGroupId?: string | null;
  onClose: () => void;
  /** Fired after a successful post, so the screen behind can reload its stock. */
  onPosted: () => void;
}

const blankLine = (key: number): Line => ({ key, stockGroupId: '', qty: '' });

const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the entry will actually be stored as - the same derivation the server
 * runs, shown here so the mode is never a surprise on the way back.
 *
 * Moulded goods have no per-kg contract behind them, so they are man-hour and
 * nothing else. Everything else is contract until day labour is entered
 * against it, at which point it is mixed - or man-hour outright, if the
 * contract half was zeroed.
 */
const modeFor = (
  material: LoadingMaterial,
  labourers: number,
  hours: number,
  kg: number,
): LoadingMode => {
  if (material === 'moulded') return 'manhour';
  if (!(labourers > 0 && hours > 0)) return 'contract';
  return kg > 0 ? 'mixed' : 'manhour';
};

const MODE_LABEL: Record<LoadingMode, string> = {
  contract: 'Contract',
  manhour: 'Daily wage (man-hours)',
  mixed: 'Mixed — contract plus daily labour',
};

export function NewDispatchSheet({
  open,
  groups,
  initialGroupId = null,
  onClose,
  onPosted,
}: NewDispatchSheetProps) {
  const notify = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [transportProvided, setTransportProvided] = useState(false);
  const [transportCharge, setTransportCharge] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  /** One figure per quality on the document - see the note at the top. */
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});

  // -- the loading job -------------------------------------------------------
  const [material, setMaterial] = useState<LoadingMaterial>('reclaim');
  /** Blank means "the sacks on the document", which is the usual answer. */
  const [kgLoaded, setKgLoaded] = useState('');
  const [labourers, setLabourers] = useState('');
  const [hours, setHours] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [loadingRates, setLoadingRates] = useState({ perKg: 0, perHour: 0 });

  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** The group label the server refused, so its line can carry the reason. */
  const [rejected, setRejected] = useState<{ label: string; message: string } | null>(null);

  /**
   * Only what can actually be loaded: stock left, and the lab has passed it.
   *
   * The sheet is handed every group in the yard and picks here, rather than
   * being handed a pre-filtered list. That way one rule decides what may go on a
   * vehicle and it is written where the form can also say why about the rest -
   * the screen behind this sheet shows the blocked groups with their reason and
   * a dead button, which is a different thing from hiding them.
   */
  const loadable = useMemo(
    () => groups.filter((g) => g.available_qty > 0 && g.qc_status === 'pass'),
    [groups],
  );
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  useEffect(() => {
    if (!open) return;
    void customerService
      .list({ limit: 200, order: 'asc' })
      .then((res) => setCustomers(res.rows))
      .catch((err) => notify(toRequestError(err).message, 'err'));

    /*
     * The two loading rates, for the running total below. The figures that end
     * up on the record are read again on the server and snapshotted there -
     * these are only what the form shows while it is being filled in, so a
     * stale copy here cannot become a stale cost on the document.
     *
     * Off `loading-rates` rather than the full cost table, which is the back
     * office's: the yard raises dispatch notes now, and a supervisor needing to
     * see what a lorry costs to load is no reason to hand them the plant's
     * overheads and interest rate. Two numbers, and they are the two on screen.
     */
    void rateService
      .loadingRates()
      .then(({ data }) =>
        setLoadingRates({
          perKg: Number(data?.loadingPerKg ?? 0),
          perHour: Number(data?.loadingLabourPerHour ?? 0),
        }),
      )
      .catch(() => setLoadingRates({ perKg: 0, perHour: 0 }));
  }, [open, notify]);

  // What they last paid, per quality. Reloaded whenever the customer changes, so
  // the prefill is always this customer's history and never the previous one's.
  useEffect(() => {
    if (!customerId) {
      setLastPrices({});
      return;
    }
    void customerService
      .lastPrices(customerId)
      .then(setLastPrices)
      .catch(() => setLastPrices({}));
  }, [customerId]);

  /*
   * Opened from a row: that stock is line one, so the sheet arrives on the
   * group the manager tapped instead of on an empty picker they have to find it
   * in again. Keyed on `open` so each opening starts from the row it was opened
   * from, rather than from whatever the last one was left on.
   */
  useEffect(() => {
    if (!open) return;
    setLines([{ ...blankLine(1), stockGroupId: initialGroupId ?? '' }]);
  }, [open, initialGroupId]);

  /**
   * The qualities actually on the document - what has to carry a price - and
   * what each is sold by.
   *
   * The unit rides along because the price is per unit and the two must be read
   * together: "Rs 44" against LOOP means forty-four rupees a loop, and a field
   * labelled per sack would be the same number meaning something else entirely.
   */
  const qualities = useMemo(() => {
    const seen = new Map<string, StockUnit>();
    for (const line of lines) {
      const group = line.stockGroupId ? groupById.get(line.stockGroupId) : undefined;
      if (group?.quality && !seen.has(group.quality)) seen.set(group.quality, group.unit);
    }
    return [...seen].map(([quality, unit]) => ({ quality, unit }));
  }, [lines, groupById]);

  /** Just the names, which is what the price map and the payload are keyed on. */
  const qualityNames = useMemo(() => qualities.map((q) => q.quality), [qualities]);

  /*
   * A quality that arrives on the document gets what this customer last paid
   * filled in - which is the order things happen in when the sheet was opened
   * from a row and the customer picked afterwards. Only ever into a blank: a
   * figure already typed is the one somebody chose, and the whole point of
   * showing the price is that it is never applied behind their back.
   */
  useEffect(() => {
    setPrices((current) => {
      let changed = false;
      const next = { ...current };
      for (const quality of qualityNames) {
        if (next[quality]?.trim()) continue;
        const suggested = lastPrices[quality];
        if (suggested == null) continue;
        next[quality] = String(suggested);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [qualityNames, lastPrices]);

  const reset = useCallback(() => {
    setCustomerId('');
    setDate(todayISO());
    setTransportProvided(false);
    setTransportCharge('');
    setRemarks('');
    setLines([blankLine(1)]);
    setPrices({});
    setLastPrices({});
    setMaterial('reclaim');
    setKgLoaded('');
    setLabourers('');
    setHours('');
    setVehicleNo('');
    setFormError(null);
    setRejected(null);
  }, []);

  const close = () => {
    if (posting) return;
    reset();
    onClose();
  };

  const setLine = (key: number, patch: Partial<Line>) => {
    setRejected(null);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  // -- what it all comes to --------------------------------------------------
  const priceOf = (quality?: string | null) =>
    quality ? (asNumber(prices[quality] ?? '') ?? 0) : 0;

  const lineTotal = (line: Line) => {
    const quality = line.stockGroupId ? groupById.get(line.stockGroupId)?.quality : null;
    return round2((asNumber(line.qty) ?? 0) * priceOf(quality));
  };

  /*
   * Only the bagged lines. A moulded piece is not a sack and adding the two
   * would put a moulded load on the weighbridge at fifty kilos a loop - the
   * server works the document's real weight out from each group's own per-unit
   * figure, and this is only the form's running estimate of the same thing.
   */
  const totalSacks = lines.reduce(
    (sum, line) =>
      sum +
      (line.stockGroupId && groupById.get(line.stockGroupId)?.unit === 'sacks'
        ? (asNumber(line.qty) ?? 0)
        : 0),
    0,
  );
  const goodsTotal = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const transport = transportProvided ? (asNumber(transportCharge) ?? 0) : 0;

  /** The sacks on the document at 50 kg each, unless a weighbridge net was typed. */
  const defaultKg = round2(totalSacks * SACK_KG);
  const contractKg = material === 'moulded' ? 0 : (asNumber(kgLoaded) ?? defaultKg);
  const crew = asNumber(labourers) ?? 0;
  const worked = asNumber(hours) ?? 0;

  const mode = modeFor(material, crew, worked, contractKg);
  const contractCost = mode === 'contract' || mode === 'mixed' ? round2(contractKg * loadingRates.perKg) : 0;
  const manhourCost = mode === 'manhour' || mode === 'mixed' ? round2(crew * worked * loadingRates.perHour) : 0;
  const loadingCost = round2(contractCost + manhourCost);
  const grandTotal = round2(goodsTotal + transport);

  const validate = (): string | null => {
    if (!customerId) return 'Pick the customer this is going to.';
    if (!date) return 'A dispatch date is needed.';
    const filled = lines.filter((line) => line.stockGroupId);
    if (!filled.length) return 'Add at least one line.';

    for (const line of filled) {
      const group = groupById.get(line.stockGroupId);
      const qty = asNumber(line.qty);
      if (!group) return 'One of the lines points at stock that is no longer listed.';
      if (qty == null || qty <= 0) {
        return `${group.display_label}: enter the ${UNIT_NOUN[group.unit].many} going out.`;
      }
      if (qty > group.available_qty) {
        return `${group.display_label} has only ${counted(group.available_qty, group.unit)} left.`;
      }
      /*
       * The lab's verdict, checked here as well as at the picker.
       *
       * The picker only offers passed stock, so this cannot normally fire - it
       * fires when the yard moved while the sheet was open and a group was put
       * on hold under a line already filled in. post_dispatch() would refuse it
       * anyway, and does; saying so before the round trip is the difference
       * between a corrected line and a rejected document.
       */
      if (group.qc_status !== 'pass') {
        return `${group.display_label} has not passed QC — take it off the document.`;
      }
    }

    // Two lines off one group would each be checked against the same figure and
    // together take more than there is. Sending them separately is the way to
    // do that on purpose; here it is nearly always a mis-click.
    const ids = filled.map((line) => line.stockGroupId);
    if (new Set(ids).size !== ids.length) return 'The same stock group is on two lines.';

    // The rule this block exists for: nothing goes out unpriced.
    const unpriced = qualityNames.filter((quality) => !(priceOf(quality) > 0));
    if (unpriced.length) {
      return unpriced.length === 1
        ? `Enter the selling price for ${unpriced[0]}.`
        : `Enter a selling price for each of: ${unpriced.join(', ')}.`;
    }

    // Half a man-hour entry costs nothing and looks like it was filled in.
    if ((crew > 0) !== (worked > 0)) {
      return 'Daily labour needs both the number of labourers and the hours worked.';
    }
    if (material === 'moulded' && !(crew > 0 && worked > 0)) {
      return 'Moulded goods are costed by man-hours — enter the labourers and hours.';
    }
    return null;
  };

  const submit = async () => {
    if (posting) return;
    const problem = validate();
    setFormError(problem);
    if (problem) return;

    const payload: DispatchPayload = {
      customer_id: customerId,
      dispatch_date: date,
      transport_provided: transportProvided,
      transport_charge: transport,
      remarks: remarks.trim() || null,
      lines: lines
        .filter((line) => line.stockGroupId)
        .map((line) => ({
          stock_group_id: line.stockGroupId,
          qty: asNumber(line.qty) as number,
          // Advisory. The server writes the group's own unit onto the line and
          // refuses a document that named a different one - which is what stops
          // a stale form buying pieces at a sack price.
          unit: groupById.get(line.stockGroupId)?.unit,
        })),
      prices: Object.fromEntries(qualityNames.map((quality) => [quality, priceOf(quality)])),
      // No entry at all when nothing was recorded - the customer's own crew
      // loading their own vehicle is a real thing, and it is reported as a gap
      // rather than invented as a zero.
      loading:
        contractKg > 0 || crew > 0
          ? {
              loading_mode: mode,
              material_kind: material,
              kg_loaded: contractKg,
              manhour_labourers: crew,
              manhour_hours: worked,
              vehicle_no: vehicleNo.trim() || null,
            }
          : null,
    };

    setPosting(true);
    setRejected(null);
    try {
      const posted = await dispatchService.create(payload);
      // Both counts where the document carried both. A load of forty sacks and
      // four thousand loops has no single number, and reporting only the sacks
      // would read as though the moulded half had not gone.
      const went = [
        posted.sacks ? counted(posted.sacks, 'sacks') : null,
        posted.pieces ? counted(posted.pieces, 'pieces') : null,
      ].filter(Boolean);
      notify(`Dispatch posted · ${went.join(' + ')} · ${rupees(posted.total)}`);
      reset();
      onPosted();
      onClose();
    } catch (err) {
      const error = toRequestError(err);
      // A 409 is the yard having moved under the form - another vehicle took
      // the sacks, or the group is on hold. Nothing was written, and the label
      // the server named is what puts the message on the right line.
      const label = (error.errors?.[0] as { label?: string } | undefined)?.label ?? null;
      if (error.status === 409 && label) setRejected({ label, message: error.message });
      setFormError(error.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title="Issue a dispatch"
      subtitle="Only stock with sacks left and a QC pass can be loaded. Every quality on the document needs a selling price before it can go."
      led="var(--led-elec)"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={posting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={posting} disabled={posting}>
            {posting ? 'Posting…' : 'Post dispatch'}
          </Button>
        </>
      }
    >
      <SheetLabel>Who and when</SheetLabel>
      <SelectField
        label="Customer"
        value={customerId}
        onChange={(e) => {
          setCustomerId(e.target.value);
          setFormError(null);
        }}
      >
        <option value="">Pick a customer…</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </SelectField>

      <FieldRow>
        <TextField
          label="Dispatch date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <SelectField
          label="Transportation provided"
          value={transportProvided ? 'yes' : 'no'}
          onChange={(e) => setTransportProvided(e.target.value === 'yes')}
        >
          <option value="no">Customer&apos;s own</option>
          <option value="yes">We provided it</option>
        </SelectField>
      </FieldRow>

      {transportProvided && (
        <TextField
          label="Transport charge"
          note="added to the total"
          type="number"
          inputMode="decimal"
          suffix="Rs"
          placeholder="0"
          value={transportCharge}
          onChange={(e) => setTransportCharge(e.target.value)}
        />
      )}

      <SheetLabel className="mt-3">What is going out</SheetLabel>

      {lines.map((line, index) => {
        const group = line.stockGroupId ? groupById.get(line.stockGroupId) : undefined;
        const refused = rejected && group && group.display_label === rejected.label;
        return (
          <div key={line.key} className="mb-3 rounded-lg border border-line p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <small className="muted">Line {index + 1}</small>
              {lines.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  disabled={posting}
                >
                  Remove
                </Button>
              )}
            </div>

            <SelectField
              label="Stock"
              value={line.stockGroupId}
              onChange={(e) => setLine(line.key, { stockGroupId: e.target.value })}
            >
              <option value="">Pick a batch, a coarse pool or a moulded pack…</option>
              {loadable.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.display_label} · {option.quality ?? '—'} ·{' '}
                  {counted(option.available_qty, option.unit)} left
                </option>
              ))}
            </SelectField>

            <TextField
              label={group ? capitalise(UNIT_NOUN[group.unit].many) : 'Quantity'}
              note={
                group
                  ? [
                      `${counted(group.available_qty, group.unit)} available`,
                      // A moulded order is placed in boxes, so the picker says
                      // how many boxes the count on the line comes to.
                      group.pack_size
                        ? `${group.pack_size} to a pack · ${round2(
                            (asNumber(line.qty) ?? 0) / group.pack_size,
                          )} packs`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : undefined
              }
              type="number"
              inputMode="numeric"
              placeholder={group ? String(group.available_qty) : '0'}
              value={line.qty}
              onChange={(e) => setLine(line.key, { qty: e.target.value.replace(/[^\d]/g, '') })}
            />

            {group && (
              <Readout
                label={
                  <>
                    <QualityChip quality={group.quality ?? 'Coarse'} /> {group.display_label}
                  </>
                }
                value={rupees(lineTotal(line))}
                className="mt-1.5"
              />
            )}

            {refused && <FormWarning>{rejected?.message}</FormWarning>}
          </div>
        );
      })}

      <Button
        variant="ghost"
        onClick={() => setLines((current) => [...current, blankLine(Date.now())])}
        disabled={posting || !loadable.length}
      >
        + Add a line
      </Button>

      {/*
        One figure per quality, not per line. Two pallets of Fine off two
        different batches go out at the same rate, because that is what the
        customer was quoted - and the sheet will not submit while any of these
        is blank.
      */}
      <SheetLabel className="mt-3">Selling price per quality</SheetLabel>
      {qualities.length ? (
        qualities.map(({ quality, unit }) => (
          <TextField
            key={quality}
            label={quality}
            note={
              lastPrices[quality] != null ? `last ${rupees(lastPrices[quality])}` : 'no history'
            }
            type="number"
            inputMode="decimal"
            /* Per whatever this quality is sold by. Reclaim goes by the sack and
               moulded goods by the piece, and the same figure means two very
               different sums depending on which - so the field says which. */
            suffix={`Rs / ${UNIT_NOUN[unit].one}`}
            value={prices[quality] ?? ''}
            onChange={(e) => {
              setRejected(null);
              setPrices((current) => ({ ...current, [quality]: e.target.value }));
            }}
          />
        ))
      ) : (
        <p className="muted mb-2 text-sm">Pick some stock and its qualities appear here to price.</p>
      )}

      {/*
        The loading job. The daily-labour block is shown on every load, contract
        ones included: any day-labour worker's time has to be accounted in
        man-hours wherever they worked, and a block that only appears after
        someone picks the right mode is a block nobody finds.
      */}
      <SheetLabel className="mt-3">Loading</SheetLabel>

      <FieldRow>
        <SelectField
          label="Material"
          value={material}
          onChange={(e) => setMaterial(e.target.value as LoadingMaterial)}
        >
          <option value="reclaim">Reclaim / coarse</option>
          <option value="moulded">Moulded goods</option>
        </SelectField>
        <TextField
          label="Vehicle no."
          note="opt."
          value={vehicleNo}
          onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
        />
      </FieldRow>

      {/* Moulded goods have no per-kg contract behind them, so the contract
          half is not offered for them rather than being offered and ignored. */}
      {material !== 'moulded' && (
        <TextField
          label="Kg loaded"
          note={`contract at ${rupees(loadingRates.perKg)}/kg · blank = ${defaultKg} kg from the sacks`}
          type="number"
          inputMode="decimal"
          suffix="kg"
          placeholder={String(defaultKg)}
          value={kgLoaded}
          onChange={(e) => setKgLoaded(e.target.value)}
        />
      )}

      <SheetLabel className="mt-2">Daily labour on this load?</SheetLabel>
      <FieldRow>
        <TextField
          label="Labourers"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={labourers}
          onChange={(e) => setLabourers(e.target.value.replace(/[^\d]/g, ''))}
        />
        <TextField
          label="Hours worked"
          note={`at ${rupees(loadingRates.perHour)}/hr each`}
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </FieldRow>

      <Readout label="Costed as" value={MODE_LABEL[mode]} className="mb-1.5" />
      {contractCost > 0 && (
        <Readout
          label={`Contract · ${contractKg} kg`}
          value={rupees(contractCost)}
          className="mb-1.5"
        />
      )}
      {manhourCost > 0 && (
        <Readout
          label={`Man-hours · ${crew} × ${worked} h`}
          value={rupees(manhourCost)}
          className="mb-1.5"
        />
      )}
      <Readout label="Loading cost" value={rupees(loadingCost)} className="mb-2.5" />

      <SheetLabel className="mt-3">Total</SheetLabel>
      <Readout label="Goods" value={rupees(goodsTotal)} className="mb-1.5" />
      {transportProvided && (
        <Readout label="Transport" value={rupees(transport)} className="mb-1.5" />
      )}
      <Readout
        label="Dispatch total"
        value={rupees(grandTotal)}
        valueColor="var(--elec)"
        className="mb-1.5"
      />
      {/* Beside the total rather than inside it. Loading is what serving this
          load costs us; it is not something the customer is being charged. */}
      <Readout
        label="Cost to serve (loading)"
        value={rupees(loadingCost)}
        className="mb-2.5"
      />

      <TextAreaField
        label="Remarks"
        note="opt."
        rows={2}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />

      {/* The 409 already sits on its own line; this is everything else. */}
      {formError && !rejected && <FormWarning>{formError}</FormWarning>}
    </BottomSheet>
  );
}

export default NewDispatchSheet;
