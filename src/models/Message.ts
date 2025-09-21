import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';

export interface IMessageMedia {
  url: string;
  type: 'image' | 'video' | 'audio';
  width?: number;
  height?: number;
  duration?: number; // for video/audio in seconds
  filename?: string;
  size?: number; // file size in bytes
}

export interface IMessageReaction {
  by: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

export interface IMessage {
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  text?: string;
  media?: IMessageMedia;
  reactions: IMessageReaction[];
  editedAt?: Date;
  deletedAt?: Date | null;
}

export interface IMessageDoc extends Document, IMessage {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  edit(newText: string): Promise<void>;
  softDelete(): Promise<void>;
  addReaction(userId: Types.ObjectId, emoji: string): Promise<void>;
  removeReaction(userId: Types.ObjectId): Promise<void>;
  getReactionCount(emoji: string): number;
  hasUserReacted(userId: Types.ObjectId, emoji?: string): boolean;
}

export interface IMessageQueryHelpers {
  notDeleted(this: QueryWithHelpers<any, IMessageDoc, IMessageQueryHelpers>): any;
}

export interface IMessageModel extends Model<IMessageDoc, IMessageQueryHelpers> {
  findByThread(threadId: Types.ObjectId, cursor?: Date, limit?: number): Promise<IMessageDoc[]>;
  findRecentMessages(threadIds: Types.ObjectId[], limit?: number): Promise<IMessageDoc[]>;
  getUnreadCount(threadId: Types.ObjectId, userId: Types.ObjectId): Promise<number>;
}

const MessageMediaSchema = new Schema<IMessageMedia>({
  url: { type: String, required: true },
  type: { type: String, enum: ['image', 'video', 'audio'], required: true },
  width: { type: Number, min: 0 },
  height: { type: Number, min: 0 },
  duration: { type: Number, min: 0 },
  filename: { type: String },
  size: { type: Number, min: 0 }
}, { _id: false });

const MessageReactionSchema = new Schema<IMessageReaction>({
  by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, maxlength: 10 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const MessageSchema = new Schema<IMessageDoc, IMessageModel, IMessageDoc, IMessageQueryHelpers>({
  threadId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Thread', 
    required: true,
    index: true
  },
  senderId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  text: { type: String, maxlength: 2000 },
  media: { type: MessageMediaSchema },
  reactions: [MessageReactionSchema],
  editedAt: { type: Date },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Indexes for performance
MessageSchema.index({ threadId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ deletedAt: 1 });
MessageSchema.index({ createdAt: -1 });

// Compound index for efficient thread message queries
MessageSchema.index({ threadId: 1, deletedAt: 1, createdAt: -1 });

// Query helpers
MessageSchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

// Instance methods
MessageSchema.methods.edit = async function(newText: string): Promise<void> {
  this.text = newText;
  this.editedAt = new Date();
  await this.save();
};

MessageSchema.methods.softDelete = async function(): Promise<void> {
  this.deletedAt = new Date();
  await this.save();
};

MessageSchema.methods.addReaction = async function(userId: Types.ObjectId, emoji: string): Promise<void> {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter((r: IMessageReaction) => !r.by.equals(userId));
  
  // Add new reaction
  this.reactions.push({
    by: userId,
    emoji,
    createdAt: new Date()
  });
  
  await this.save();
};

MessageSchema.methods.removeReaction = async function(userId: Types.ObjectId): Promise<void> {
  this.reactions = this.reactions.filter((r: IMessageReaction) => !r.by.equals(userId));
  await this.save();
};

MessageSchema.methods.getReactionCount = function(emoji: string): number {
  return this.reactions.filter((r: IMessageReaction) => r.emoji === emoji).length;
};

MessageSchema.methods.hasUserReacted = function(userId: Types.ObjectId, emoji?: string): boolean {
  if (emoji) {
    return this.reactions.some((r: IMessageReaction) => r.by.equals(userId) && r.emoji === emoji);
  }
  return this.reactions.some((r: IMessageReaction) => r.by.equals(userId));
};

// Static methods
MessageSchema.statics.findByThread = function(
  threadId: Types.ObjectId, 
  cursor?: Date, 
  limit = 50
): Promise<IMessageDoc[]> {
  const query: any = { 
    threadId, 
    deletedAt: null 
  };
  
  if (cursor) {
    query.createdAt = { $lt: cursor };
  }
  
  return this.find(query)
    .populate('senderId', 'username avatarUrl')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

MessageSchema.statics.findRecentMessages = function(
  threadIds: Types.ObjectId[], 
  limit = 20
): Promise<IMessageDoc[]> {
  return this.find({
    threadId: { $in: threadIds },
    deletedAt: null
  })
    .populate('senderId', 'username avatarUrl')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

MessageSchema.statics.getUnreadCount = function(threadId: Types.ObjectId, userId: Types.ObjectId): Promise<number> {
  return this.countDocuments({
    threadId,
    senderId: { $ne: userId },
    deletedAt: null,
    createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
  });
};

// Validation
MessageSchema.pre('save', function(next) {
  if (!this.text && !this.media) {
    return next(new Error('Message must have either text or media'));
  }
  next();
});

export const Message = (mongoose.models.Message as IMessageModel) || mongoose.model<IMessageDoc, IMessageModel>('Message', MessageSchema);