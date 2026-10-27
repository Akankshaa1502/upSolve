import mongoose from 'mongoose';

let memoryServer = null;

/** Connects Mongoose. `uri === 'memory'` boots an in-memory MongoDB (dev/tests only). */
export async function connectDb(uri) {
  let target = uri;
  if (uri === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    // Smallest WiredTiger cache so it fits small hosts (Render free tier has 512 MB RAM).
    memoryServer = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
    target = memoryServer.getUri('upsolve');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(target);
  // Make sure unique indexes exist before we accept writes (idempotent sync relies on them).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return target;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
