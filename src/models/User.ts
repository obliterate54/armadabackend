import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  displayName: { type: String },
  photoURL: { type: String },
}, { timestamps: true });

UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });

export const User = model('User', UserSchema);