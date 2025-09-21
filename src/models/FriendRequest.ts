import { Schema, model, Types } from 'mongoose';

export interface IFriendRequest {
  _id: Types.ObjectId;
  from: Types.ObjectId;
  to: Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FriendRequestSchema = new Schema<IFriendRequest>({
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
FriendRequestSchema.methods.accept = function() {
  this.status = 'accepted';
  return this.save();
};

FriendRequestSchema.methods.decline = function() {
  this.status = 'declined';
  return this.save();
};

FriendRequestSchema.methods.block = function() {
  this.status = 'blocked';
  return this.save();
};

// Static methods
FriendRequestSchema.statics.findPendingRequests = function(userId: Types.ObjectId) {
  return this.find({ to: userId, status: 'pending' })
    .populate('from', 'username email avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
};

FriendRequestSchema.statics.findSentRequests = function(userId: Types.ObjectId) {
  return this.find({ from: userId, status: 'pending' })
    .populate('to', 'username email avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
};

FriendRequestSchema.statics.findExistingRequest = function(fromId: Types.ObjectId, toId: Types.ObjectId) {
  return this.findOne({ from: fromId, to: toId });
};

FriendRequestSchema.statics.getRequestHistory = function(userId: Types.ObjectId, limit = 50) {
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

export const FriendRequest = model<IFriendRequest>('FriendRequest', FriendRequestSchema);