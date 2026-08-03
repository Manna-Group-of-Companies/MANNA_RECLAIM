import { crud, op } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { displayLabel } from '../utils/stockPeriod.js';
import { loadingService, splitByKg } from './loading.service.js';

/**
 * Who the plant sells to, and what has gone out to them.
 *
 * The table predates this: the rate card is keyed on the customer's name and
 * always has been, so the name is still the primary key in Postgres. What the
 * migration added is a surrogate `id`, because a dispatch points at a customer
 * and a name is not something to hang a foreign key off - names get corrected,
 * and a correction would orphan every dispatch that named the old one.
 *
 * Nothing here is reachable with the browser's key: RLS on this table names
 * service_role and nothing else, so a customer list is something the API hands
 * out after checking the role, not something a page can go and read.
 */

const base = crud(TABLES.customers, { defaultSort: 'name' });
const dispatches = crud(TABLES.dispatches, { defaultSort: 'dispatch_date' });
const lines = crud(TABLES.dispatchLines, { defaultSort: 'created_at' });
const groupsTable = crud(TABLES.stockGroups, { defaultSort: 'created_at' });

const serialize = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone ?? null,
  address: row.address ?? null,
  region: row.region ?? null,
  active: row.active !== false,
  created_at: row.created_at ?? null,
});

const num = (value) => Number(value ?? 0);
const round2 = (n) => Math.round(n * 100) / 100;

export const customerService = {
  ...base,

  /**
   * The list, or what matches a search. `?q=` matches on the name, which is the
   * only thing anyone looks a customer up by.
   */
  async list(query = {}) {
    const term = String(query.q ?? '').trim();
    const filters = {
      ...(term ? { name: op.ilike(`*${term}*`) } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
    };
    const result = await base.list({ order: 'asc', limit: 200, ...query }, filters);
    return { ...result, rows: result.rows.map(serialize) };
  },

  async findById(id) {
    return serialize(await base.findById(id));
  },

  async create(payload = {}) {
    const name = String(payload.name ?? '').trim();
    if (!name) throw ApiError.badRequest('A customer name is required');
    if (await base.exists({ name })) throw ApiError.conflict(`${name} is already a customer`);
    return serialize(await base.create({ ...payload, name }));
  },

  async update(id, patch = {}) {
    return serialize(await base.update(id, patch));
  },

  /**
   * What has gone out to this customer, newest first, each document with the
   * lines it was made of and what it cost to serve.
   *
   * This is the only door to a past dispatch. There is no standalone dispatch
   * history screen, by design: the question anyone actually asks is "what has
   * this customer bought", so it is answered off the customer rather than off a
   * ledger that would have to be filtered back down to one every time.
   *
   * The lines and the loading entries are each fetched for the whole page in
   * one read rather than per dispatch - a customer with a year of business
   * behind them would otherwise cost two requests per document to open.
   */
  async dispatchHistory(id, query = {}) {
    const customer = await customerService.findById(id);
    const result = await dispatches.list(
      { order: 'desc', sort: 'dispatch_date', limit: 100, ...query },
      { customer_id: id },
    );
    const ids = result.rows.map((row) => row.id);
    const [lineRows, loadingByDispatch] = await Promise.all([
      ids.length ? lines.all({ dispatch_id: ids }, { sort: 'created_at', ascending: true }) : [],
      loadingService.byDispatch(ids),
    ]);

    // Which group each line drew from, by name rather than by id - a coarse line
    // reads AUG-H2, and the id says nothing to anyone.
    const groupIds = [...new Set(lineRows.map((line) => line.stock_group_id).filter(Boolean))];
    const groups = groupIds.length
      ? await groupsTable.all({ id: groupIds }, { sort: 'created_at' })
      : [];
    const labelOf = new Map(groups.map((group) => [group.id, displayLabel(group.label)]));

    const byDispatch = lineRows.reduce((acc, line) => {
      (acc[line.dispatch_id] ||= []).push({
        id: line.id,
        stock_group_id: line.stock_group_id,
        label: labelOf.get(line.stock_group_id) ?? null,
        quality: line.quality ?? null,
        sacks: num(line.sacks),
        unit_price: num(line.unit_price),
        line_total: round2(num(line.line_total) || num(line.sacks) * num(line.unit_price)),
      });
      return acc;
    }, {});

    const rows = result.rows.map((row) => {
      const own = byDispatch[row.id] ?? [];
      const goods = round2(own.reduce((sum, line) => sum + line.line_total, 0));
      const transport = round2(num(row.transport_charge));
      const loading = loadingByDispatch.get(row.id) ?? null;
      // The sacks that went out, split by grade - what the customer's record is
      // read across rather than one total that hides which grade moved.
      const byQuality = own.reduce((acc, line) => {
        const key = line.quality ?? 'Unspecified';
        acc[key] = (acc[key] ?? 0) + line.sacks;
        return acc;
      }, {});

      // One loading job covers the whole truck, so the cost comes back apart by
      // kg before any single quality's contribution can be read off it.
      const shares = splitByKg(loading?.loading_cost ?? 0, own);
      const priced = own.map((line, index) => ({ ...line, loading_share: shares[index] ?? 0 }));
      const loadingCost = round2(num(loading?.loading_cost));

      return {
        id: row.id,
        dispatch_date: row.dispatch_date ?? null,
        transport_provided: Boolean(row.transport_provided),
        transport_charge: transport,
        remarks: row.remarks ?? null,
        created_at: row.created_at ?? null,
        sacks: own.reduce((sum, line) => sum + line.sacks, 0),
        sacks_by_quality: byQuality,
        goods_total: goods,
        total: round2(goods + transport),
        /**
         * What it cost to put this load on a truck, beside the transport rather
         * than inside the goods. Both are costs to serve; neither is in the
         * rupees-per-kg the reclaim itself carries.
         */
        loading,
        loading_cost: loadingCost,
        labour_recorded: Boolean(loading?.has_labour),
        /** Goods less what serving them cost. The reclaim's own cost is on the detail. */
        contribution: round2(goods - loadingCost - (row.transport_provided ? transport : 0)),
        lines: priced,
      };
    });

    return { customer, rows, total: result.total, page: result.page, limit: result.limit };
  },

  /**
   * What this customer last paid for a grade, so the dispatch form can offer it
   * rather than ask for it cold.
   *
   * It is a prefill and never a default the form applies quietly: the screen
   * shows the figure for confirmation on every line, because a price carried
   * over from three months ago is exactly the kind of thing that goes out wrong
   * and is only noticed on the invoice.
   */
  async lastPrices(id) {
    const rows = await dispatches.all({ customer_id: id }, { sort: 'dispatch_date' });
    if (!rows.length) return {};
    const ids = rows.map((row) => row.id);
    const order = new Map(ids.map((value, index) => [value, index]));
    const lineRows = await lines.all({ dispatch_id: ids }, { sort: 'created_at' });

    const best = {};
    for (const line of lineRows) {
      const quality = line.quality;
      if (!quality) continue;
      const rank = order.get(line.dispatch_id) ?? Number.MAX_SAFE_INTEGER;
      if (!best[quality] || rank < best[quality].rank) {
        best[quality] = { rank, price: num(line.unit_price) };
      }
    }
    return Object.fromEntries(Object.entries(best).map(([quality, v]) => [quality, v.price]));
  },
};

export default customerService;
