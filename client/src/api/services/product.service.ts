import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Product } from '@/types/models';

/**
 * A product a press moulds. Every figure is optional: a product with nothing but
 * a name is still one a press can be set up for, and the sheets say what is unset
 * rather than inventing it.
 */
export interface ProductPayload {
  name?: string;
  cureTempC?: number | null;
  cyclicMin?: number | null;
  cavities?: number | null;
  compoundRate?: number | null;
  note?: string | null;
  active?: boolean;
  sortOrder?: number;

  /**
   * The other half of a product record: what it is ordered under, what it ships
   * as, which machine it comes off, and the cost inputs behind a unit of it.
   * `code` is unique across the list - that is what an order is matched on.
   */
  code?: string | null;
  quality?: string | null;
  packSizeKg?: number | null;
  /**
   * How a moulded product is boxed, and what one piece weighs. `packSizeKg`
   * above is a different figure - what a sack of a reclaim grade weighs -
   * because a moulded product is sold by the piece rather than by weight, so its
   * pack is a count. The yard keys moulded stock on the product and this pack.
   */
  packSize?: number | null;
  packLabel?: string | null;
  pieceKg?: number | null;
  machineId?: string | null;
  rawMaterialCost?: number | null;
  firewoodCost?: number | null;
  powerKwh?: number | null;
  labourCost?: number | null;
  machineHours?: number | null;
}

export const productService = {
  list: (params?: ListQuery) => requestPaged<Product>(endpoints.products.root, params),

  /** What a press start sheet offers - the products still in use. */
  listActive: () => requestPaged<Product>(endpoints.products.root, { active: true, limit: 100 }),

  async create(payload: ProductPayload): Promise<Product> {
    const res = await axiosClient.post<ApiEnvelope<Product>>(endpoints.products.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: ProductPayload): Promise<Product> {
    const res = await axiosClient.patch<ApiEnvelope<Product>>(endpoints.products.byId(id), patch);
    return res.data.data;
  },

  /**
   * Takes a product off the list without deleting it - the press runs that
   * moulded it still name it, and their costing reads the rate off those rows.
   */
  async retire(id: string): Promise<Product> {
    const res = await axiosClient.delete<ApiEnvelope<Product>>(endpoints.products.byId(id));
    return res.data.data;
  },
};

export default productService;
