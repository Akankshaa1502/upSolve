import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/** Requires a valid `Authorization: Bearer <jwt>` header; sets req.userId. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized());
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (!mongoose.isValidObjectId(payload.sub)) throw new Error('bad subject');
    req.userId = new mongoose.Types.ObjectId(payload.sub);
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}
