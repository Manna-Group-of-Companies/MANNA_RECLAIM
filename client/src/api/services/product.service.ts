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
