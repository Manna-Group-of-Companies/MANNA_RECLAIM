import { ApiError } from '../utils/ApiError.js';

/**
 * Validates request parts against zod schemas and replaces them with the
 * parsed values: `validate({ body: createBatchSchema })`.
 */
export const validate = (schemas = {}) => (req, _res, next) => {
  for (const part of ['body', 'query', 'params']) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || part,
        message: i.message,
      }));
      return next(ApiError.unprocessable('Validation failed', details));
    }
    req[part] = result.data;
  }
  return next();
};

export default validate;
