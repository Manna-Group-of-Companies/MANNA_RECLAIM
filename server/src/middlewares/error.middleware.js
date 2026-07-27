import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/** Terminal error handler. Must stay the last `app.use`. */
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    if (error?.type === 'entity.parse.failed') error = ApiError.badRequest('Malformed JSON body');
    else if (error?.name === 'ZodError') error = ApiError.unprocessable('Validation failed', error.issues);
    else error = new ApiError(error?.statusCode || 500, error?.message || 'Internal server error');
  }

  const { statusCode, message, details } = error;
  if (statusCode >= 500) logger.error(req.method, req.originalUrl, message, err?.stack);
  else logger.warn(req.method, req.originalUrl, statusCode, message);

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(env.isProd ? {} : { stack: err?.stack }),
  });
}

export default errorHandler;
