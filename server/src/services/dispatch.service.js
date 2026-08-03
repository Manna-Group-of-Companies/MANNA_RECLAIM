import { randomUUID } from 'node:crypto';
import { crud } from './base.service.js';
import { absentSchema, rpc } from '../config/supabase.js';
import { TABLES, VIEWS, SACK_KG } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { noSuchFunction } from '../utils/rpc.js';
import { displayLabel } from '../utils/stockPeriod.js';
import { rateService } from './rate.service.js';
import { loadingService, splitByKg, kgOfSacks, toRow as toLoadingRow } from './loading.service.js';

const base = crud(TABLES.dispatches, { defaultSort: 'dispatched_at' });
const loads = crud(TABLES.dispatchLoads, { defaultSort: 'created_at' });
const lines = crud(TABLES.dispatchLines, { defaultSort: 'created_at' });
const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const customers = crud(TABLES.customers, { defaultSort: 'name' });

/**
 * The per-kg cost a batch ended up carrying, from the costing view.
 *
 * Read here only to be subtracted in the margin. It is a figure that was
 * settled when the batch consumed its crumb and is not recomputed - which is
 * the whole reason loading is kept out of it. A project without the view, or a
 * coarse pool with no batch behind it, simply has no figure and the margin
 * reports null rather than a guess.
 */
const batchCosting = crud(VIEWS.specialBatchDetail, { defaultSort: 'batch_no' });

/**
 * Supabase named these columns after the weighbridge slip - `customer_name`,
 * `quality`, `weight_kg`, `dispatched_at` - while the client models and the
 * costing report were written against customer/grade/total_kg/dispatch_date.
 * Rows are translated on the way out and payloads on the way in, so the table
 * keeps its own names and neither side has to learn the other's.
 */
export const fromRow = (row) =>
  row && {
    ...row,
    customer: row.customer_name ?? null,
    grade: row.quality ?? null,
    total_kg: Number(row.weight_kg || 0),
    dispatch_date: row.dispatched_at ? String(row.dispatched_at).slice(0, 10) : null,
    vehicle: row.vehicle_no ?? null,
  };

const toRow = (payload = {}) => {
  const { customer, grade, total_kg: totalKg, dispatch_date: date, vehicle, ...rest } = payload;
  return {
    ...rest,
    ...(customer !== undefined ? { customer_name: customer } : {}),
    ...(grade !== undefined ? { quality: grade } : {}),
    ...(totalKg !== undefined ? { weight_kg: totalKg } : {}),
    ...(date !== undefined ? { dispatched_at: date } : {}),
    ...(vehicle !== undefined ? { vehicle_no: vehicle } : {}),
  };
};

/**
 * Money is never stored on a dispatch - it is the customer's rate for that
 * grade times the weight, priced at read time so a rate correction reprices
 * the history instead of leaving stale totals behind.
 */
const priced = (raw, card, kg) => {
  const row = fromRow(raw);
  if (!row) return row;
  const weight = kg ?? row.total_kg;
  const { rate, note } = rateService.rateFor(row.customer, row.grade, card.table, card.list);
  return {
    ...row,
    total_kg: weight,
    rate,
    rate_note: note || null,
    amount: rate != null ? +(weight * rate).toFixed(2) : null,
  };
};

/**
 * What post_dispatch() raised, as something a screen can act on.
 *
 * The function marks the two refusals a manager can do anything about with a
 * prefix and the offending group's label, because a form needs to put the
 * message on one line rather than at the top of the page. Anything else is
 * whatever Postgres said.
 */
const MARKERS = {
  STOCK_SHORT: (label) =>
    ApiError.conflict(`${label} does not have that many sacks left - reload the stock and try again`, [
      { field: 'sacks', message: `Not enough stock in ${label}`, label },
    ]),
  STOCK_QC: (label) =>
    ApiError.conflict(`${label} has not passed QC, so it cannot be dispatched`, [
      { field: 'stock_group_id', message: `${label} has not passed QC`, label },
    ]),
  /**
   * The request named a unit the stock is not counted in - pieces against a
   * pallet of sacks, or the other way about. A stale form, and the reason it is
   * refused rather than corrected is the price: the figure beside it was typed
   * per whatever the form thought it was selling, so absorbing the mismatch
   * would put moulded goods out at a sack rate.
   */
  STOCK_UNIT: (label) =>
    ApiError.conflict(`${label} is not counted in those units - reload the stock and try again`, [
      { field: 'unit', message: `${label} is counted differently`, label },
    ]),
  STOCK_PRICE: (label) =>
    ApiError.unprocessable(`A unit price above zero is required for ${label}`, [
      { field: 'unit_price', message: 'A price above zero is required', label },
    ]),
  STOCK_SACKS: (label) =>
    ApiError.unprocessable(`A sack count above zero is required for ${label}`, [
      { field: 'sacks', message: 'A count above zero is required', label },
    ]),
  STOCK_MISSING: (label) => ApiError.notFound(`Stock group ${label} is not on the list`),
};

function translatePostError(err) {
  const message = err?.pgMessage ?? err?.message ?? '';
  const match = /^(STOCK_[A-Z]+):(.*)$/s.exec(String(message).trim());
  if (match && MARKERS[match[1]]) return MARKERS[match[1]](displayLabel(match[2].trim()));
  return err instanceof ApiError ? err : ApiError.badRequest(String(message) || 'The dispatch was refused');
}

const num = (value) => Number(value ?? 0);
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The batch number behind a stock group, or null if there is not one.
 *
 * A batch group's label is `<batch>-<grade>` - see stockPeriod's batchLabel -
 * and the grade is on the row, so the batch is what is left when the grade's
 * suffix comes off. Trimmed this way round rather than by splitting on the
 * hyphen, because a batch number may hold one of its own.
 */
const batchNoOf = (group) => {
  if (!group || group.kind !== 'batch' || !group.label) return null;
  const suffix = `-${group.quality ?? ''}`;
  const label = String(group.label);
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
};

/**
 * What each group's reclaim cost per kg was, frozen at its batch, keyed by
 * group id.
 *
 * This is the figure loading must never be folded into. It was settled when the
 * batch consumed its crumb, and it is read here only to be subtracted on the
 * other side of the margin. A coarse pool is not batch-identified and so has no
 * entry; nor does a project without the costing view, or a batch nobody has
 * costed yet. All three answer null and the margin says so.
 */
async function batchCostPerKg(stock = []) {
  const wanted = new Map();
  for (const group of stock) {
    const batch = batchNoOf(group);
    if (batch) wanted.set(group.id, batch);
  }
  if (!wanted.size) return new Map();

  const batchNos = [...new Set(wanted.values())];
  let costed = [];
  try {
    costed = await batchCosting.all({ batch_no: batchNos });
  } catch {
    // The view is from the prototype's costing and a project may not have it.
    // A margin that cannot be worked out is reported as unknown; it is not a
    // reason to refuse to show the dispatch.
    return new Map();
  }

  const perBatch = new Map(
    costed
      .filter((row) => row?.cost_per_kg != null)
      .map((row) => [String(row.batch_no), num(row.cost_per_kg)]),
  );
  return new Map(
    [...wanted]
      .map(([groupId, batch]) => [groupId, perBatch.get(String(batch))])
      .filter(([, perKg]) => perKg != null),
  );
}

/**
 * What the dispatch actually earned.
 *
 *   margin = goods sold
 *          - kg x the batch's frozen rupees-per-kg reclaim
 *          - loading cost
 *          - transport, when we provided it
 *
 * Loading belongs on this side of the line and nowhere else. It is a cost to
 * serve, incurred after the goods existed, so folding it into rupees-per-kg
 * reclaim would charge rubber for a lorry that had not been loaded when it was
 * made - see the note in loading.service.js. Picking is the opposite case and
 * does flow upstream into rupees-per-kg.
 *
 * `margin` is null unless every line's reclaim cost is known. A margin computed
 * with a missing term reads as a thin one, and somebody acts on it; a margin
 * that says it cannot be worked out gets the batch costed instead.
 */
function marginOf({ goods, transport, loading, lines = [], transportProvided }) {
  const loadingCost = round2(num(loading?.loading_cost));
  const carried = transportProvided ? round2(num(transport)) : 0;
  const known = lines.length > 0 && lines.every((line) => line.reclaim_cost != null);
  const reclaimCost = known ? round2(lines.reduce((sum, line) => sum + num(line.reclaim_cost), 0)) : null;

  return {
    loading_cost: loadingCost,
    reclaim_cost: reclaimCost,
    margin: reclaimCost == null ? null : round2(num(goods) - reclaimCost - loadingCost - carried),
  };
}

export const dispatchService = {
  ...base,
  loads,
  lines,

  /**
   * Prices each line off the per-quality figures on the header.
   *
   * The rate is agreed per quality, not per pallet: a customer is quoted a
   * price for Fine and every sack of Fine on the document goes at it. So the
   * form sends one figure per quality and the price lands on the lines here,
   * which is also what makes "no quality may go out unpriced" checkable - the
   * qualities actually on the document are only known once the groups have been
   * read, and the group is what says what grade a line is, never the client.
   *
   * A quality with no price is a 422 naming it, not a line quietly dropped and
   * not a fall back to the rate card. A list price applied silently is how a
   * load goes out at last quarter's figure and is only noticed on the invoice.
   */
  async priceLines(requested = [], prices = {}) {
    const ids = [...new Set(requested.map((line) => line.stock_group_id).filter(Boolean))];
    const stock = ids.length ? await groups.all({ id: ids }) : [];
    const groupById = new Map(stock.map((group) => [group.id, group]));

    const unpriced = new Set();
    /** Lines whose request named a unit the stock is not counted in. */
    const mismatched = new Set();

    const lines = requested.map((line) => {
      const group = groupById.get(line.stock_group_id);
      /*
       * A form that has gone stale about what it is selling.
       *
       * Caught here rather than only in post_dispatch() - which also refuses it
       * - because this is where the message can name the group and the form can
       * put it on the offending line. The database keeps its own check for
       * anything that reaches the function another way.
       *
       * Refused rather than corrected, and the price is why: the figure beside
       * the line was typed per whatever the form thought it was selling, so
       * quietly substituting the right unit would put moulded goods out at a
       * sack rate on a document that afterwards looks entirely correct.
       */
      if (group && line.unit && line.unit !== (group.unit ?? 'sacks')) {
        mismatched.add(displayLabel(group.label));
      }
      // No group here means no group in the database either - the function
      // raises STOCK_MISSING for it, which is a better message than anything
      // this could say, so the line is passed through to meet it.
      const quality = group ? (group.quality ?? line.quality ?? null) : null;
      const price = quality == null ? 0 : num(prices[quality]);
      if (group && !(price > 0)) {
        unpriced.add(quality ?? displayLabel(group.label) ?? line.stock_group_id);
      }
      return {
        stock_group_id: line.stock_group_id,
        quality,
        /*
         * The quantity, in the group's own unit. Named `sacks` because that is
         * the column post_dispatch() writes and the one `line_total` is
         * generated from - `unit` beside it is what says whether the number is
         * sacks of Fine or pieces of LOOP, and the price was typed per that
         * same unit.
         *
         * `qty` is accepted from the form as the honest name for it; `sacks` is
         * still taken so a client that has not been rebuilt keeps working.
         */
        sacks: line.qty ?? line.sacks,
        /*
         * Read off the group, never off the request - the request's own unit is
         * only ever used to refuse it, just above. post_dispatch() writes the
         * group's unit onto the line as well, so the stored line says what the
         * stock said whichever way the function was reached.
         */
        unit: group ? (group.unit ?? 'sacks') : (line.unit ?? null),
        unit_price: price,
      };
    });

    // Before the pricing complaint: a document sold in the wrong unit has a
    // price problem too, and "your price is missing" is the wrong thing to tell
    // somebody whose form is out of date about what it is selling.
    if (mismatched.size) {
      const named = [...mismatched];
      throw ApiError.conflict(
        named.length === 1
          ? `${named[0]} is not counted in those units - reload the stock and try again`
          : `These are not counted in the units sent - reload the stock and try again: ${named.join(', ')}`,
        named.map((label) => ({ field: 'unit', message: `${label} is counted differently`, label })),
      );
    }

    if (unpriced.size) {
      const named = [...unpriced];
      throw ApiError.unprocessable(
        named.length === 1
          ? `A selling price is required for ${named[0]}`
          : `A selling price is required for each of: ${named.join(', ')}`,
        named.map((quality) => ({
          field: `prices.${quality}`,
          message: 'A price above zero is required',
          quality,
        })),
      );
    }
    return lines;
  },

  /**
   * What a set of priced lines weighs, off each group's own per-unit figure.
   *
   * The loading gang is paid for a truck, and a truck is loaded by weight - so
   * this is what the contract half of the loading entry defaults to when the
   * form did not send a weighbridge net. The manager can always type the net in,
   * which is the better figure anyway.
   *
   * A group with no `kg_per_unit` on it is one written before 0005, or one on a
   * project that has not run it. Sacks fall back to fifty kilos apiece, which is
   * what the whole plant means by a sack and what this arithmetic was before the
   * column existed. Pieces do not fall back to anything: there is no default
   * weight for a moulded piece, and inventing one would put a fabricated figure
   * on a costed loading entry. It contributes nothing and the manager types the
   * net, which is the honest failure.
   */
  async weightOf(lines = []) {
    const ids = [...new Set(lines.map((line) => line.stock_group_id).filter(Boolean))];
    if (!ids.length) return 0;
    const stock = await groups.all({ id: ids });
    const perUnit = new Map(
      stock.map((group) => [
        group.id,
        group.kg_per_unit != null
          ? num(group.kg_per_unit)
          : (group.unit ?? 'sacks') === 'sacks'
            ? SACK_KG
            : 0,
      ]),
    );
    return round2(
      lines.reduce((sum, line) => sum + num(line.sacks) * (perUnit.get(line.stock_group_id) ?? 0), 0),
    );
  },

  /**
   * Posts a whole dispatch - header, lines and the loading job - in one
   * transaction.
   *
   * Everything that decides whether it may go out happens inside
   * post_dispatch(): each group is locked, its QC verdict checked, and its stock
   * drawn down with a conditional UPDATE that only matches while the sacks are
   * actually there. Two vehicles loading the same coarse pool therefore queue
   * behind one another rather than both reading the same availability, and the
   * one that loses gets a 409 naming the group instead of a silent oversell.
   *
   * The loading entry goes in the same call for the same reason as the lines: a
   * dispatch that went out with no record of what it cost to load is precisely
   * the gap this exists to close, and writing the two separately is how that gap
   * comes back. Both rates are snapshotted onto it before it goes - see
   * loading.service.js - so nothing here or afterwards re-reads a settings
   * figure against a job already done.
   *
   * Nothing is written from here in pieces, because a header that survived a
   * failed line would be a delivery note for goods that never left.
   */
  async post(payload = {}, createdBy = null) {
    const id = payload.id ?? randomUUID();
    const lines = await dispatchService.priceLines(payload.lines ?? [], payload.prices ?? {});
    // Only the bagged lines, for the older sack-count fallback. Pieces are not
    // sacks and counting them as such would put a moulded load on the
    // weighbridge at fifty kilos a loop.
    const sacks = lines.reduce(
      (sum, line) => sum + ((line.unit ?? 'sacks') === 'sacks' ? num(line.sacks) : 0),
      0,
    );
    const kg = await dispatchService.weightOf(lines);
    const loading = await loadingService.prepare(payload.loading ?? null, { sacks, kg });

    const body = {
      p_id: id,
      p_customer_id: payload.customer_id,
      p_dispatch_date: payload.dispatch_date,
      p_transport_provided: Boolean(payload.transport_provided),
      p_transport_charge: num(payload.transport_charge),
      p_remarks: payload.remarks ?? null,
      p_created_by: createdBy,
      p_lines: lines,
      p_loading: loading,
    };

    let result;
    try {
      result = await rpc('post_dispatch', body);
    } catch (err) {
      /*
       * A project still on 0001 has the eight-argument post_dispatch(), and
       * PostgREST cannot match a body carrying `p_loading` to it - so the whole
       * document would be refused for want of a costing table.
       *
       * The load left the yard either way. The dispatch is posted without its
       * loading entry rather than not posted at all, and the list reports it as
       * having no labour recorded, which is the truth on a project that cannot
       * store one yet. Only ever retried when there was a loading entry to
       * drop: without one the two calls are identical, and retrying would just
       * turn a real refusal into two of them.
       */
      if (loading && noSuchFunction(err)) {
        const { p_loading: _dropped, ...withoutLoading } = body;
        logger.warn(
          `Dispatch ${id}: posted without its loading entry - the project has no ` +
            'nine-argument post_dispatch(). Run supabase/migrations/0002_loading_activity.sql.',
        );
        try {
          result = await rpc('post_dispatch', withoutLoading);
        } catch (retried) {
          throw translatePostError(retried);
        }
      } else {
        throw translatePostError(err);
      }
    }
    return dispatchService.detailOf(id, result);
  },

  /**
   * What has gone out lately, newest first.
   *
   * There was deliberately no standalone dispatch ledger while only the back
   * office could post one - the question was always "what has this customer
   * bought", which is answered off the customer. That stopped being the whole
   * truth when the yard started loading vehicles: a supervisor who has just
   * posted a document and cannot see it afterwards has no way to tell a double
   * entry from a failed one, and will post it twice to be sure.
   *
   * It is a header list. The sacks and the money are summed off the lines
   * rather than read off the header, because post_dispatch() does not denormalise
   * either onto it - the lines are the record of what left. Tapping a row is
   * what fetches the detail, so this stays four reads however long the list is.
   *
   * `labour_recorded` is the one thing here that is not a total. A dispatch can
   * legitimately have no loading cost - the customer's own crew loading their
   * own vehicle - but so can one where the form was tabbed through, and the two
   * are indistinguishable afterwards unless the gap is on the list. Flagged
   * rather than refused at entry, because refusing would only teach the office
   * to type a number in.
   */
  async recent(query = {}) {
    const result = await base.list({ order: 'desc', limit: 20, ...query });
    const rows = result.rows.map(fromRow);
    if (!rows.length) return { ...result, rows };

    const ids = rows.map((row) => row.id).filter(Boolean);
    const [own, loadingByDispatch] = await Promise.all([
      ids.length ? lines.all({ dispatch_id: ids }) : [],
      loadingService.byDispatch(ids),
    ]);

    // One read for the names rather than one per row. A dispatch always names a
    // customer, but a customer deleted since is not a reason to hide the load.
    const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
    const named = customerIds.length ? await customers.all({ id: customerIds }) : [];
    const nameOf = new Map(named.map((row) => [row.id, row.name]));

    const summed = new Map();
    for (const line of own) {
      const tally =
        summed.get(line.dispatch_id) ??
        { sacks: 0, pieces: 0, goods: 0, lines: 0, byQuality: {} };
      // Counted apart, because sacks and pieces are not the same quantity and a
      // single total covering both is a number that means nothing on a list
      // whose whole job is "did that load go out".
      if ((line.unit ?? 'sacks') === 'pieces') tally.pieces += num(line.sacks);
      else tally.sacks += num(line.sacks);
      tally.goods += num(line.line_total) || num(line.sacks) * num(line.unit_price);
      tally.lines += 1;
      // What actually went, split by grade. A load is one row on the list and
      // usually more than one product, so a bare sack count says how much left
      // without saying what - and "did that go through" is a question about the
      // Special, not about the total.
      if (line.quality) {
        tally.byQuality[line.quality] = (tally.byQuality[line.quality] ?? 0) + num(line.sacks);
      }
      summed.set(line.dispatch_id, tally);
    }

    return {
      ...result,
      rows: rows.map((row) => {
        const tally =
          summed.get(row.id) ?? { sacks: 0, pieces: 0, goods: 0, lines: 0, byQuality: {} };
        const transport = num(row.transport_charge);
        const loading = loadingByDispatch.get(row.id) ?? null;
        return {
          id: row.id,
          dispatch_date: row.dispatch_date,
          customer: nameOf.get(row.customer_id) ?? row.customer ?? null,
          vehicle: loading?.vehicle_no ?? row.vehicle ?? null,
          sacks: tally.sacks,
          /** Moulded goods on the same document, counted in their own unit. */
          pieces: tally.pieces,
          /** What went, split by grade or product - what left, not just how much. */
          sacks_by_quality: tally.byQuality,
          lines: tally.lines,
          goods_total: round2(tally.goods),
          transport_charge: transport,
          total: round2(tally.goods + transport),
          loading_mode: loading?.loading_mode ?? null,
          loading_cost: round2(num(loading?.loading_cost)),
          /** False on any loading job with no labour recorded against it at all. */
          labour_recorded: Boolean(loading?.has_labour),
          remarks: row.remarks ?? null,
          created_at: row.created_at ?? null,
        };
      }),
    };
  },

  /**
   * One posted dispatch: its lines, the groups they drew from, what it cost to
   * load, and the margin that leaves.
   *
   * The loading cost is one figure for one truck, so it is split back across
   * the lines by kg before any single quality's margin can be read - see
   * splitByKg(). The frozen per-kg the batch was carrying is subtracted where
   * it is known and reported as null where it is not, which is the honest
   * answer for a coarse pool: a pool has no batch behind it and therefore no
   * batch cost, so a margin quoted against one would be invented.
   */
  async detailOf(id, totals = null) {
    const header = await base.findById(id);
    const own = await lines.all({ dispatch_id: id }, { sort: 'created_at', ascending: true });
    const groupIds = [...new Set(own.map((line) => line.stock_group_id).filter(Boolean))];
    const [stock, loadingRows] = await Promise.all([
      groupIds.length ? groups.all({ id: groupIds }, { sort: 'created_at' }) : [],
      // Forgiving of a project that has not run 0002 yet - see rowsFor().
      loadingService.rowsFor({ dispatch_id: id }),
    ]);
    const groupById = new Map(stock.map((group) => [group.id, group]));
    const loading = loadingRows.length ? toLoadingRow(loadingRows[0]) : null;

    const costPerKg = await batchCostPerKg(stock);

    /*
     * What each line weighs, from the group's own per-unit figure.
     *
     * A sack is fifty kilos and always was; a moulded piece weighs whatever the
     * product says it weighs, and nothing if the back office has not recorded
     * it. That last case is why this is worked out here rather than assumed
     * downstream: a piece with no weight contributes nothing to the split and
     * reports no reclaim cost, which is the honest answer, where fifty kilos a
     * piece would be a fabrication that reached the margin.
     */
    const weighed = own.map((line) => {
      const group = groupById.get(line.stock_group_id);
      const qty = num(line.sacks);
      const unit = line.unit ?? group?.unit ?? 'sacks';
      const perUnit = group?.kg_per_unit != null ? num(group.kg_per_unit) : null;
      return {
        line,
        group,
        qty,
        unit,
        kg: round2(perUnit != null ? qty * perUnit : unit === 'sacks' ? kgOfSacks(qty) : 0),
      };
    });
    const shares = splitByKg(loading?.loading_cost ?? 0, weighed);

    const rows = weighed.map(({ line, group, qty, unit, kg }, index) => {
      const perKg = costPerKg.get(line.stock_group_id) ?? null;
      return {
        id: line.id,
        stock_group_id: line.stock_group_id,
        label: group ? displayLabel(group.label) : null,
        quality: line.quality ?? group?.quality ?? null,
        /** The quantity, and what it counts. `sacks` is kept as the old name. */
        unit,
        qty,
        sacks: qty,
        kg,
        unit_price: num(line.unit_price),
        line_total: round2(num(line.line_total) || qty * num(line.unit_price)),
        /** This line's share of the one loading job, by kg. */
        loading_share: shares[index] ?? 0,
        /** What the reclaim on this line cost to make, frozen at the batch. */
        reclaim_cost: perKg == null ? null : round2(kg * perKg),
      };
    });

    const goods = round2(totals ? num(totals.goods_total) : rows.reduce((s, l) => s + l.line_total, 0));
    const transport = round2(num(header.transport_charge));

    return {
      id: header.id,
      customer_id: header.customer_id ?? null,
      dispatch_date: header.dispatch_date ?? null,
      transport_provided: Boolean(header.transport_provided),
      transport_charge: transport,
      remarks: header.remarks ?? null,
      created_by: header.created_by ?? null,
      created_at: header.created_at ?? null,
      /*
       * The document's quantity, split by what it counts.
       *
       * `sacks` is kept and now means what it says - bagged sacks, not "every
       * unit on the document" - because a total that added forty sacks to four
       * thousand loops was arithmetic on two different things, and it is read
       * by the delivery note. kg is the one figure that legitimately covers
       * both, and is what the truck was loaded by.
       */
      sacks: rows.reduce((sum, line) => sum + (line.unit === 'sacks' ? line.qty : 0), 0),
      pieces: rows.reduce((sum, line) => sum + (line.unit === 'pieces' ? line.qty : 0), 0),
      kg: round2(rows.reduce((sum, line) => sum + line.kg, 0)),
      goods_total: goods,
      total: round2(goods + transport),
      loading,
      ...marginOf({ goods, transport, loading, lines: rows, transportProvided: header.transport_provided }),
      lines: rows,
    };
  },

  /**
   * The legacy weighbridge rows, priced off the rate card.
   *
   * These are what the tablets wrote before a dispatch had lines: a customer
   * name, a grade and a weight, with no stock behind them. Nothing writes one
   * any more - the only way in is post() above - but the costing report still
   * reads the plant's history through here, so the pricing stays.
   */
  async list(query = {}, filters = {}) {
    const [result, card] = await Promise.all([
      base.list({ order: 'desc', ...query }, toRow(filters)),
      rateService.card(),
    ]);
    return { ...result, rows: result.rows.map((row) => priced(row, card)) };
  },

  /**
   * How many sacks have already gone out against each of the given packed runs,
   * keyed by run id - what the Stock tab's packed stock is drawn down by.
   *
   * A project that has not run supabase/schema.sql has no `run_id` to tie a load
   * back with, so nothing can be said to have left: it answers empty rather than
   * failing the read, and every packed sack reads as still in the yard.
   */
  async sacksByRun(runIds = []) {
    const ids = [...new Set(runIds.filter(Boolean))];
    if (!ids.length) return {};
    if ((absentSchema()[TABLES.dispatches] ?? []).includes('run_id')) return {};

    const rows = await base.all({ run_id: ids }, { sort: 'dispatched_at' });
    return rows.reduce((totals, row) => {
      totals[row.run_id] = (totals[row.run_id] ?? 0) + Number(row.sacks || 0);
      return totals;
    }, {});
  },

};

export default dispatchService;
