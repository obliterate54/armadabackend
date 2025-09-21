import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';

export interface IFriendRequest {
  from: Types.ObjectId;
  to: Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  message?: string;
}

export interface IFriendRequestDoc extends Document, IFriendRequest {
  _id: Types.ObjectId;
  accept(): Promise<void>;
  decline(): Promise<void>;
  block(): Promise<void>;
}

export interface IFriendRequestQueryHelpers {
  // Add any query helpers if needed
}

export interface IFriendRequestModel extends Model<IFriendRequestDoc, IFriendRequestQueryHelpers> {
  findPendingRequests(userId: Types.ObjectId): Promise<IFriendRequestDoc[]>;
  findSentRequests(userId: Types.ObjectId): Promise<IFriendRequestDoc[]>;
  findExistingRequest(fromId: Types.ObjectId, toId: Types.ObjectId): Promise<IFriendRequestDoc | null>;
  getRequestHistory(userId: Types.ObjectId, limit?: number): Promise<IFriendRequestDoc[]>;
}

const FriendRequestSchema = new Schema<IFriendRequestDoc, IFriendRequestModel, IFriendRequestDoc, IFriendRequestQueryHelpers>({
  from: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  to: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'declined', 'blocked'],
    default: 'pending',
    index: true
  },
  message: { type: String, maxlength: 200 }
}, {
  timestamps: true
});

// Compound unique index to prevent duplicate requests
FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

// Indexes for queries
FriendRequestSchema.index({ to: 1, status: 1 });
FriendRequestSchema.index({ from: 1, status: 1 });
FriendRequestSchema.index({ createdAt: -1 });

// Instance methods
FriendRequestSchema.methods.accept = async function(): Promise<void> {
  this.status = 'accepted';
  await this.save();
};

FriendRequestSchema.methods.decline = async function(): Promise<void> {
  this.status = 'declined';
  await this.save();
};

FriendRequestSchema.methods.block = async function(): Promise<void> {
  this.status = 'blocked';
  await this.save();
};

// Static methods
FriendRequestSchema.statics.findPendingRequests = function(userId: Types.ObjectId): Promise<IFriendRequestDoc[]> {
  return this.find({ to: userId, status: 'pending' })
    .populate('from', 'username email avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
};

FriendRequestSchema.statics.findSentRequests = function(userId: Types.ObjectId): Promise<IFriendRequestDoc[]> {
  return this.find({ from: userId, status: 'pending' })
    .populate('to', 'username email avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
};

FriendRequestSchema.statics.findExistingRequest = function(
  fromId: Types.ObjectId, 
  toId: Types.ObjectId
): Promise<IFriendRequestDoc | null> {
  return this.findOne({ from: fromId, to: toId });
};

FriendRequestSchema.statics.getRequestHistory = function(
  userId: Types.ObjectId, 
  limit = 50
): Promise<IFriendRequestDoc[]> {
  return this.find({
    $or: [{ from: userId }, { to: userId }],
    status: { $in: ['accepted', 'declined'] }
  })
    .populate('from', 'username avatarUrl')
    .populate('to', 'username avatarUrl')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
};

export const FriendRequest = (mongoose.models.FriendRequest as IFriendRequestModel) || mongoose.model<IFriendRequestDoc, IFriendRequestModel>('FriendRequest', FriendRequestSchema);