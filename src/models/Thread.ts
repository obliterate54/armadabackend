import { Schema, model } from 'mongoose';

const ThreadSchema = new Schema({
  authorId: { type: String, index: true, required: true }, // uid
  text: { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: () => new Date(), index: true }
});

ThreadSchema.index({ authorId: 1, createdAt: -1 });

export const Thread = model('Thread', ThreadSchema);
