import { ApiError } from '../utils/ApiError.js';

/**
 * Validates req[part] against a zod schema and replaces it with the parsed (coerced, stripped) value.
 * Parsed values go on req.valid[part] because Express 5 makes req.query read-only.
 */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req.valid = { ...(req.valid || {}), [part]: result.data };
    next();
  };
}
