import { Schema, model } from 'mongoose';

const DeviceTokenSchema = new Schema({
  uid: { type: String, index: true, required: true },
  token: { type: String, unique: true, required: true },
  platform: { type: String },
  updatedAt: { type: Date, default: () => new Date() }
});

export const DeviceToken = model('DeviceToken', DeviceTokenSchema);
