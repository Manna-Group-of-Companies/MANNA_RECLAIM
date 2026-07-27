import { ApiError } from '../utils/ApiError.js';

export const notFound = (req, _res, next) =>
  next(ApiError.notFound('Route ' + req.method + ' ' + req.originalUrl + ' does not exist'));

export default notFound;
