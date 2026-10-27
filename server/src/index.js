import './models/index.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  await connectDb(env.mongoUri);
  console.log(`MongoDB connected${env.mongoUri === 'memory' ? ' (in-memory: data resets on restart)' : ''}`);

  if (env.seedOnStart) {
    const { seedDemo } = await import('../scripts/seed.js');
    await seedDemo({ log: console.log });
  }

  const server = createApp().listen(env.port, () => console.log(`upSolve API listening on http://localhost:${env.port}`));

  const shutdown = async () => {
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
