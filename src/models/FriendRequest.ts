import { Schema, model } from 'mongoose';

const FriendRequestSchema = new Schema({
  from: { type: String, index: true, required: true }, // uid
  to:   { type: String, index: true, required: true }, // uid
  status: { type: String, enum: ['pending','accepted','declined'], default: 'pending', index: true },
  createdAt: { type: Date, default: () => new Date(), index: true }
});

FriendRequestSchema.index({ from: 1, to: 1, status: 1 }, { unique: true });

export const FriendRequest = model('FriendRequest', FriendRequestSchema);
