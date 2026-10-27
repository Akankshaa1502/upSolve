import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/respond.js';
import { env } from '../config/env.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many attempts, try again in a few minutes')),
});

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().trim().max(80).optional(),
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });

router.post('/register', limiter, validate(registerSchema), async (req, res) => {
  const { email, password, name } = req.valid.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create({ email, name: name ?? '', passwordHash: await bcrypt.hash(password, 12) });
  ok(res, { token: signToken(user), user }, 201);
});

router.post('/login', limiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password so emails can't be enumerated.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  ok(res, { token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  ok(res, { user });
});

export default router;
