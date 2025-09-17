import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  uid: { type: String, unique: true, index: true, required: true },
  username: { type: String, unique: true, sparse: true },
  displayName: { type: String },
  photoURL: { type: String },
}, { timestamps: true });

export const User = model('User', UserSchema);
