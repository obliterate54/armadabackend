import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';

export interface IThread {
  participants: Types.ObjectId[];
  lastMessageAt?: Date;
  unreadCounts: Map<string, number>; // userId -> count
  isGroup: boolean;
  title?: string;
  convoyId?: Types.ObjectId;
  deletedAt?: Date | null;
}

export interface IThreadDoc extends Document, IThread {
  _id: Types.ObjectId;
  addParticipant(userId: Types.ObjectId): Promise<void>;
  removeParticipant(userId: Types.ObjectId): Promise<void>;
  markAsRead(userId: Types.ObjectId): Promise<void>;
  incrementUnread(userId: Types.ObjectId): Promise<void>;
  updateLastMessage(): Promise<void>;
}

export interface IThreadQueryHelpers {
  notDeleted(this: QueryWithHelpers<any, IThreadDoc, IThreadQueryHelpers>): any;
}

export interface IThreadModel extends Model<IThreadDoc, IThreadQueryHelpers> {
  findByParticipants(participantIds: Types.ObjectId[]): Promise<IThreadDoc[]>;
  findUserThreads(userId: Types.ObjectId, limit?: number): Promise<IThreadDoc[]>;
  findOrCreateDM(userId1: Types.ObjectId, userId2: Types.ObjectId): Promise<IThreadDoc>;
  createGroupThread(participants: Types.ObjectId[], title?: string): Promise<IThreadDoc>;
}

const ThreadSchema = new Schema<IThreadDoc, IThreadModel, IThreadDoc, IThreadQueryHelpers>({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessageAt: { type: Date },
  unreadCounts: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isGroup: { type: Boolean, default: false },
  title: { type: String, maxlength: 100 },
  convoyId: { type: Schema.Types.ObjectId, ref: 'Convoy' },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Indexes
ThreadSchema.index({ participants: 1 });
ThreadSchema.index({ lastMessageAt: -1 });
ThreadSchema.index({ convoyId: 1 });
ThreadSchema.index({ deletedAt: 1 });

// Compound index for efficient participant queries
ThreadSchema.index({ participants: 1, lastMessageAt: -1 });

// Query helpers
ThreadSchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

// Instance methods
ThreadSchema.methods.addParticipant = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    this.unreadCounts.set(userId.toString(), 0);
  }
  await this.save();
};

ThreadSchema.methods.removeParticipant = async function(userId: Types.ObjectId): Promise<void> {
  this.participants = this.participants.filter((id: Types.ObjectId) => !id.equals(userId));
  this.unreadCounts.delete(userId.toString());
  await this.save();
};

ThreadSchema.methods.markAsRead = async function(userId: Types.ObjectId): Promise<void> {
  this.unreadCounts.set(userId.toString(), 0);
  await this.save();
};

ThreadSchema.methods.incrementUnread = async function(userId: Types.ObjectId): Promise<void> {
  const current = this.unreadCounts.get(userId.toString()) || 0;
  this.unreadCounts.set(userId.toString(), current + 1);
  await this.save();
};

ThreadSchema.methods.updateLastMessage = async function(): Promise<void> {
  this.lastMessageAt = new Date();
  await this.save();
};

// Static methods
ThreadSchema.statics.findByParticipants = function(participantIds: Types.ObjectId[]): Promise<IThreadDoc[]> {
  return this.find({
    participants: { $all: participantIds },
    deletedAt: null
  }).sort({ lastMessageAt: -1 });
};

ThreadSchema.statics.findUserThreads = function(userId: Types.ObjectId, limit = 50): Promise<IThreadDoc[]> {
  return this.find({
    participants: userId,
    deletedAt: null
  })
    .populate('participants', 'username avatarUrl lastSeenAt')
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .exec();
};

ThreadSchema.statics.findOrCreateDM = async function(userId1: Types.ObjectId, userId2: Types.ObjectId): Promise<IThreadDoc> {
  // Find existing DM thread
  let thread = await this.findOne({
    participants: { $all: [userId1, userId2] },
    isGroup: false,
    deletedAt: null
  });

  if (!thread) {
    // Create new DM thread
    thread = new this({
      participants: [userId1, userId2],
      isGroup: false,
      unreadCounts: new Map([
        [userId1.toString(), 0],
        [userId2.toString(), 0]
      ])
    });
    await thread.save();
  }

  return thread;
};

ThreadSchema.statics.createGroupThread = async function(
  participants: Types.ObjectId[], 
  title?: string
): Promise<IThreadDoc> {
  const unreadCounts = new Map();
  participants.forEach(id => unreadCounts.set(id.toString(), 0));

  return this.create({
    participants,
    isGroup: true,
    title,
    unreadCounts
  });
};

export const Thread = (mongoose.models.Thread as IThreadModel) || mongoose.model<IThreadDoc, IThreadModel>('Thread', ThreadSchema);