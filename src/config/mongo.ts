import mongoose from 'mongoose';

async function cleanupUserIndexes() {
  try {
    const col = mongoose.connection.collection('users');
    const idx = await col.indexes();
    const legacy = idx.find(i => i.name === 'uid_1');
    if (legacy) {
      await col.dropIndex('uid_1');
      console.log('[mongo] dropped legacy index uid_1');
    }
  } catch (e: any) {
    console.warn('[mongo] index cleanup warning:', e?.message || e);
  }
}

export async function connectMongo(uri: string) {
  if (!uri) throw new Error('MONGO_URI missing');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'convoy' });
  console.log('[mongo] connected');
  
  // Clean up legacy indexes after connection
  await cleanupUserIndexes();
}
