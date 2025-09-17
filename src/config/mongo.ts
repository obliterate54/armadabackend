import mongoose from 'mongoose';

export async function connectMongo(uri: string) {
  if (!uri) throw new Error('MONGO_URI missing');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'convoy' });
  console.log('[mongo] connected');
}
