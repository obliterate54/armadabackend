import { Schema, model, Types } from 'mongoose';

export interface IThread {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  lastMessageAt?: Date;
  unreadCounts: Map<string, number>; // userId -> count
  isGroup: boolean;
  title?: string;
  convoyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const ThreadSchema = new Schema<IThread>({
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
  deletedAt: { type: Date }
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

// Soft delete query helpers
ThreadSchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

// Instance methods
ThreadSchema.methods.addParticipant = function(userId: Types.ObjectId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    this.unreadCounts.set(userId.toString(), 0);
  }
  return this.save();
};

ThreadSchema.methods.removeParticipant = function(userId: Types.ObjectId) {
  this.participants = this.participants.filter(id => !id.equals(userId));
  this.unreadCounts.delete(userId.toString());
  return this.save();
};

ThreadSchema.methods.markAsRead = function(userId: Types.ObjectId) {
  this.unreadCounts.set(userId.toString(), 0);
  return this.save();
};

ThreadSchema.methods.incrementUnread = function(userId: Types.ObjectId) {
  const current = this.unreadCounts.get(userId.toString()) || 0;
  this.unreadCounts.set(userId.toString(), current + 1);
  return this.save();
};

ThreadSchema.methods.updateLastMessage = function() {
  this.lastMessageAt = new Date();
  return this.save();
};

// Static methods
ThreadSchema.statics.findByParticipants = function(participantIds: Types.ObjectId[]) {
  return this.find({
    participants: { $all: participantIds },
    deletedAt: null
  }).sort({ lastMessageAt: -1 });
};

ThreadSchema.statics.findUserThreads = function(userId: Types.ObjectId, limit = 50) {
  return this.find({
    participants: userId,
    deletedAt: null
  })
    .populate('participants', 'username avatarUrl lastSeenAt')
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();
};

ThreadSchema.statics.findOrCreateDM = async function(userId1: Types.ObjectId, userId2: Types.ObjectId) {
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

ThreadSchema.statics.createGroupThread = function(participants: Types.ObjectId[], title?: string) {
  const unreadCounts = new Map();
  participants.forEach(id => unreadCounts.set(id.toString(), 0));

  return new this({
    participants,
    isGroup: true,
    title,
    unreadCounts
  });
};

export const Thread = model<IThread>('Thread', ThreadSchema);