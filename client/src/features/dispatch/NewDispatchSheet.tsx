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
import { dispatchService, type DispatchPayload } from '@/api/services/dispatch.service';
import { toRequestError } from '@/api/axiosClient';
import { useToast } from '@/hooks/useToast';
import { todayISO } from '@/utils/date';
import { rupees } from '@/utils/format';
import type { Customer, DispatchGrade, QcStatus } from '@/types/models';

/**
 * Loading a vehicle.
 *
 * The header says who it is going to and on what day, and whether we carried it;
 * the lines say what came off which stock group, how many sacks and at what
 * price. Only groups with sacks left and a QC pass can be picked - the rest are
 * on the table behind this sheet with the reason they cannot be loaded, which is
 * a different thing from being hidden.
 *
 * The price is the part worth being careful about. It is prefilled with what
 * this customer last paid for the grade and always shown, never applied
 * silently: a rate carried over from three months ago is exactly what goes out
 * wrong and is only noticed on the invoice. The API refuses a line without one.
 *
 * Submit posts once and is disabled while in flight. The whole document is one
 * transaction on the server, so a 409 - another vehicle took the sacks first, or
 * the group is on hold - means nothing was written, and the message names the
 * group so it can be shown against the line that caused it.
 */

interface Line {
  /** Local key. The line has no id until the document is posted. */
  key: number;
  stockGroupId: string;
  sacks: string;
  unitPrice: string;
}

/**
 * What the sheet needs off a stock group, and no more.
 *
 * The yard is read through two different endpoints - the manager's `/stock` and
 * the supervisor's `/stock/summary`, which is a genuinely different response
 * built by its own serializer rather than the fuller row with fields hidden.
 * Both are dispatched from, so the prop is the intersection: enough to name a
 * group, show it and check the sacks against it. A `StockGroup` satisfies this
 * as it stands; a summary row is passed through with its `label` as the one to
 * display, since the server has already put it in the form the yard reads.
 *
 * Typed this way round on purpose. Taking `StockGroup` here and casting a
 * summary row up to it would be claiming the supervisor's response carries
 * `packed_sacks` and `dispatched_sacks`, which it deliberately does not.
 */
export interface DispatchableStock {
  id: string;
  display_label: string;
  quality: DispatchGrade | null;
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
  /** Fired after a successful post, so the table behind can reload its stock. */
  onPosted: () => void;
}

const blankLine = (key: number): Line => ({ key, stockGroupId: '', sacks: '', unitPrice: '' });

const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** The group label the server refused, so its line can carry the reason. */
  const [rejected, setRejected] = useState<{ label: string; message: string } | null>(null);

  /** Only what can actually be loaded: sacks left, and the lab has passed it. */
  const loadable = useMemo(
    () => groups.filter((g) => g.available_sacks > 0 && g.qc_status === 'pass'),
    [groups],
  );
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  useEffect(() => {
    if (!open) return;
    void customerService
      .list({ limit: 200, order: 'asc' })
      .then((res) => setCustomers(res.rows))
      .catch((err) => notify(toRequestError(err).message, 'err'));
  }, [open, notify]);

  // What they last paid, per grade. Reloaded whenever the customer changes, so
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
   * group the crew tapped instead of on an empty picker they have to find it
   * in again. Keyed on `open` so each opening starts from the row it was
   * opened from, rather than from whatever the last one was left on.
   */
  useEffect(() => {
    if (!open) return;
    setLines([{ ...blankLine(1), stockGroupId: initialGroupId ?? '' }]);
  }, [open, initialGroupId]);

  /*
   * A rate that arrives after a group is already on a line still fills it in -
   * which is the order things happen in when the sheet was opened from a row
   * and the customer picked afterwards. Only ever into a blank: a figure
   * already typed is the one somebody chose, and the whole point of showing the
   * price is that it is never applied behind their back.
   */
  useEffect(() => {
    setLines((current) =>
      current.map((line) => {
        if (!line.stockGroupId || line.unitPrice.trim()) return line;
        const quality = groupById.get(line.stockGroupId)?.quality;
        const suggested = quality ? lastPrices[quality] : undefined;
        return suggested == null ? line : { ...line, unitPrice: String(suggested) };
      }),
    );
  }, [lastPrices, groupById]);

  const reset = useCallback(() => {
    setCustomerId('');
    setDate(todayISO());
    setTransportProvided(false);
    setTransportCharge('');
    setRemarks('');
    setLines([blankLine(1)]);
    setLastPrices({});
    setFormError(null);
    setRejected(null);
  }, []);

  const close = () => {
    if (posting) return;
    reset();
    onClose();
  };

  /**
   * Picking a group fills the price in from what this customer last paid for
   * that grade - if there is nothing typed yet. An amount already entered is
   * never overwritten: the figure on the line is the one somebody chose.
   */
  const pickGroup = (key: number, stockGroupId: string) => {
    setRejected(null);
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const quality = groupById.get(stockGroupId)?.quality ?? '';
        const suggested = quality ? lastPrices[quality] : undefined;
        return {
          ...line,
          stockGroupId,
          unitPrice: line.unitPrice.trim() || (suggested == null ? '' : String(suggested)),
        };
      }),
    );
  };

  const setLine = (key: number, patch: Partial<Line>) => {
    setRejected(null);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const lineTotal = (line: Line) => round2((asNumber(line.sacks) ?? 0) * (asNumber(line.unitPrice) ?? 0));
  const goodsTotal = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const transport = transportProvided ? (asNumber(transportCharge) ?? 0) : 0;
  const grandTotal = round2(goodsTotal + transport);

  const validate = (): string | null => {
    if (!customerId) return 'Pick the customer this is going to.';
    if (!date) return 'A dispatch date is needed.';
    const filled = lines.filter((line) => line.stockGroupId);
    if (!filled.length) return 'Add at least one line.';
    for (const line of filled) {
      const group = groupById.get(line.stockGroupId);
      const sacks = asNumber(line.sacks);
      const price = asNumber(line.unitPrice);
      if (!group) return 'One of the lines points at stock that is no longer listed.';
      if (sacks == null || sacks <= 0) return `${group.display_label}: enter the sacks going out.`;
      if (sacks > group.available_sacks) {
        return `${group.display_label} has only ${group.available_sacks} sacks left.`;
      }
      if (price == null || price <= 0) return `${group.display_label}: a unit price is required.`;
    }
    // Two lines off one group would each be checked against the same figure and
    // together take more than there is. Sending them separately is the way to
    // do that on purpose; here it is nearly always a mis-click.
    const ids = filled.map((line) => line.stockGroupId);
    if (new Set(ids).size !== ids.length) return 'The same stock group is on two lines.';
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
          sacks: asNumber(line.sacks) as number,
          unit_price: asNumber(line.unitPrice) as number,
        })),
    };

    setPosting(true);
    setRejected(null);
    try {
      const posted = await dispatchService.create(payload);
      notify(`Dispatch posted · ${posted.sacks} sacks · ${rupees(posted.total)}`);
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
      title="New dispatch"
      subtitle="Only stock with sacks left and a QC pass can be loaded. The price is what this customer last paid — check it before it goes out."
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
          label="Transport"
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
              onChange={(e) => pickGroup(line.key, e.target.value)}
            >
              <option value="">Pick a stock group…</option>
              {loadable.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.display_label} · {option.quality ?? '—'} · {option.available_sacks} left
                </option>
              ))}
            </SelectField>

            <FieldRow>
              <TextField
                label="Sacks"
                type="number"
                inputMode="numeric"
                placeholder={group ? String(group.available_sacks) : '0'}
                value={line.sacks}
                onChange={(e) => setLine(line.key, { sacks: e.target.value.replace(/[^\d]/g, '') })}
              />
              <TextField
                label="Unit price"
                note={
                  group?.quality && lastPrices[group.quality] != null
                    ? `last ${rupees(lastPrices[group.quality])}`
                    : 'no history'
                }
                type="number"
                inputMode="decimal"
                suffix="Rs"
                value={line.unitPrice}
                onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
              />
            </FieldRow>

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

      <SheetLabel className="mt-3">Total</SheetLabel>
      <Readout label="Goods" value={rupees(goodsTotal)} className="mb-1.5" />
      {transportProvided && (
        <Readout label="Transport" value={rupees(transport)} className="mb-1.5" />
      )}
      <Readout
        label="Dispatch total"
        value={rupees(grandTotal)}
        valueColor="var(--elec)"
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
