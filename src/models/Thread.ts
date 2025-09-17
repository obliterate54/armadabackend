import { Schema, model } from 'mongoose';

const ThreadSchema = new Schema({
  authorId: { type: String, index: true, required: true }, // uid
  text: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: () => new Date(), index: true }
});

export const Thread = model('Thread', ThreadSchema);
