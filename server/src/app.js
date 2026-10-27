import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { ok } from './utils/respond.js';
import authRoutes from './routes/auth.js';
import attemptRoutes from './routes/attempts.js';
import accountRoutes from './routes/accounts.js';
import { analyticsRouter, recommendationsRouter, reviewsRouter } from './routes/insights.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs for rate limiting behind Render/Railway/etc.
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => ok(res, { status: 'up', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/attempts', requireAuth, attemptRoutes);
  app.use('/api/accounts', requireAuth, accountRoutes);
  app.use('/api/analytics', requireAuth, analyticsRouter);
  app.use('/api/recommendations', requireAuth, recommendationsRouter);
  app.use('/api/reviews', requireAuth, reviewsRouter);

  app.use('/api', notFound);

  // Production single-service deploy: serve the built React app (client/dist) with SPA fallback.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.isProd && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
