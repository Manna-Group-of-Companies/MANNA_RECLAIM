export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }

  static badRequest(msg = 'Bad request', details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Not authenticated') { return new ApiError(401, msg); }
  static forbidden(msg = 'Not allowed') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg = 'Conflict', details) { return new ApiError(409, msg, details); }
  static unprocessable(msg = 'Unprocessable entity', details) { return new ApiError(422, msg, details); }
  static unavailable(msg = 'Service unavailable') { return new ApiError(503, msg); }
  static internal(msg = 'Internal server error') { return new ApiError(500, msg); }
}

export default ApiError;
