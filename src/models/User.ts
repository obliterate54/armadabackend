import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  displayName: { type: String },
  photoURL: { type: String },
}, { timestamps: true });

export const User = model('User', UserSchema);