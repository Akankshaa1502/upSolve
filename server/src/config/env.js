import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}

export const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT || 4000),
  // "memory" starts an in-memory MongoDB (dev/demo only).
  mongoUri: required('MONGO_URI', isProd ? undefined : 'memory'),
  // In dev we fall back to a throwaway secret so the app boots; production must set one.
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  seedOnStart: process.env.SEED_ON_START === 'true',
};

if (isProd && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
