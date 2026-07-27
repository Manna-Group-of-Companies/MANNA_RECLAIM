export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PageMeta;
  errors?: FieldError[];
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface Paged<T> {
  rows: T[];
  meta: PageMeta;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

/** Shape every slice uses for its loading/error bookkeeping. */
export interface AsyncState {
  loading: boolean;
  error: string | null;
}

export type RequestError = { message: string; status?: number; errors?: FieldError[] };
