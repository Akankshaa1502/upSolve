import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let apiErr = err;
  if (!(err instanceof ApiError)) {
    if (err instanceof mongoose.Error.ValidationError) {
      const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
      apiErr = ApiError.badRequest('Validation failed', details);
    } else if (err instanceof mongoose.Error.CastError) {
      apiErr = ApiError.badRequest(`Invalid ${err.path}`);
    } else if (err?.code === 11000) {
      apiErr = ApiError.conflict('Resource already exists');
    } else if (err?.type === 'entity.parse.failed') {
      apiErr = ApiError.badRequest('Malformed JSON body');
    } else {
      if (!env.isTest) console.error(err);
      apiErr = new ApiError(500, 'INTERNAL', 'Something went wrong');
    }
  }
  const body = { ok: false, error: { code: apiErr.code, message: apiErr.message } };
  if (apiErr.details) body.error.details = apiErr.details;
  res.status(apiErr.status).json(body);
}
