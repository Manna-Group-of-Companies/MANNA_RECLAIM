import { randomUUID } from 'node:crypto';
import { crud } from './base.service.js';
import { absentSchema, rpc } from '../config/supabase.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { displayLabel } from '../utils/stockPeriod.js';
import { rateService } from './rate.service.js';

const base = crud(TABLES.dispatches, { defaultSort: 'dispatched_at' });
const loads = crud(TABLES.dispatchLoads, { defaultSort: 'created_at' });
const lines = crud(TABLES.dispatchLines, { defaultSort: 'created_at' });
const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const customers = crud(TABLES.customers, { defaultSort: 'name' });

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

export const dispatchService = {
  ...base,
  loads,
  lines,

  /**
   * Posts a whole dispatch - header and lines - in one transaction.
   *
   * Everything that decides whether it may go out happens inside
   * post_dispatch(): each group is locked, its QC verdict checked, and its stock
   * drawn down with a conditional UPDATE that only matches while the sacks are
   * actually there. Two vehicles loading the same coarse pool therefore queue
   * behind one another rather than both reading the same availability, and the
   * one that loses gets a 409 naming the group instead of a silent oversell.
   *
   * Nothing is written from here in pieces, because a header that survived a
   * failed line would be a delivery note for goods that never left.
   */
  async post(payload = {}, createdBy = null) {
    const id = payload.id ?? randomUUID();
    const body = {
      p_id: id,
      p_customer_id: payload.customer_id,
      p_dispatch_date: payload.dispatch_date,
      p_transport_provided: Boolean(payload.transport_provided),
      p_transport_charge: num(payload.transport_charge),
      p_remarks: payload.remarks ?? null,
      p_created_by: createdBy,
      p_lines: (payload.lines ?? []).map((line) => ({
        stock_group_id: line.stock_group_id,
        // The grade is copied off the group by the function when a line does not
        // carry one, so a client cannot re-label what it is buying.
        quality: line.quality ?? null,
        sacks: line.sacks,
        unit_price: line.unit_price,
      })),
    };

    let result;
    try {
      result = await rpc('post_dispatch', body);
    } catch (err) {
      throw translatePostError(err);
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
   * what fetches the detail, so this stays three reads however long the list is.
   */
  async recent(query = {}) {
    const result = await base.list({ order: 'desc', limit: 20, ...query });
    const rows = result.rows.map(fromRow);
    if (!rows.length) return { ...result, rows };

    const ids = rows.map((row) => row.id).filter(Boolean);
    const own = ids.length ? await lines.all({ dispatch_id: ids }) : [];

    // One read for the names rather than one per row. A dispatch always names a
    // customer, but a customer deleted since is not a reason to hide the load.
    const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
    const named = customerIds.length ? await customers.all({ id: customerIds }) : [];
    const nameOf = new Map(named.map((row) => [row.id, row.name]));

    const summed = new Map();
    for (const line of own) {
      const tally = summed.get(line.dispatch_id) ?? { sacks: 0, goods: 0, lines: 0 };
      tally.sacks += num(line.sacks);
      tally.goods += num(line.line_total) || num(line.sacks) * num(line.unit_price);
      tally.lines += 1;
      summed.set(line.dispatch_id, tally);
    }

    return {
      ...result,
      rows: rows.map((row) => {
        const tally = summed.get(row.id) ?? { sacks: 0, goods: 0, lines: 0 };
        const transport = num(row.transport_charge);
        return {
          id: row.id,
          dispatch_date: row.dispatch_date,
          customer: nameOf.get(row.customer_id) ?? row.customer ?? null,
          vehicle: row.vehicle ?? null,
          sacks: tally.sacks,
          lines: tally.lines,
          goods_total: round2(tally.goods),
          transport_charge: transport,
          total: round2(tally.goods + transport),
          remarks: row.remarks ?? null,
          created_at: row.created_at ?? null,
        };
      }),
    };
  },

  /** One posted dispatch with its lines and the groups they drew from. */
  async detailOf(id, totals = null) {
    const header = await base.findById(id);
    const own = await lines.all({ dispatch_id: id }, { sort: 'created_at', ascending: true });
    const groupIds = [...new Set(own.map((line) => line.stock_group_id).filter(Boolean))];
    const stock = groupIds.length ? await groups.all({ id: groupIds }, { sort: 'created_at' }) : [];
    const labelOf = new Map(stock.map((group) => [group.id, displayLabel(group.label)]));

    const rows = own.map((line) => ({
      id: line.id,
      stock_group_id: line.stock_group_id,
      label: labelOf.get(line.stock_group_id) ?? null,
      quality: line.quality ?? null,
      sacks: num(line.sacks),
      unit_price: num(line.unit_price),
      line_total: round2(num(line.line_total) || num(line.sacks) * num(line.unit_price)),
    }));
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
      sacks: rows.reduce((sum, line) => sum + line.sacks, 0),
      goods_total: goods,
      total: round2(goods + transport),
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
   * keyed by run id - what the Dispatch tab's packed stock is drawn down by.
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
