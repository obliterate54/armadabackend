import { Schema, model, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  username: string;
  passwordHash: string;
  avatarUrl?: string;
  bio?: string;
  settings: {
    showConvoys: 'everyone' | 'friends' | 'private';
    showStats: 'everyone' | 'friends' | 'private';
    showProfile: 'everyone' | 'friends' | 'private';
    notifications: {
      convoyInvites: boolean;
      friendRequests: boolean;
      messages: boolean;
      achievements: boolean;
    };
  };
  friends: Types.ObjectId[];
  blocked: Types.ObjectId[];
  lastSeenAt: Date;
  location?: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    updatedAt: Date;
  };
  deviceTokens: string[];
  stats: {
    convoysCreated: number;
    convoysJoined: number;
    totalMiles: number;
    friendsCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const LocationSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  heading: { type: Number, min: 0, max: 360 },
  speed: { type: Number, min: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const SettingsSchema = new Schema({
  showConvoys: { 
    type: String, 
    enum: ['everyone', 'friends', 'private'], 
    default: 'friends' 
  },
  showStats: { 
    type: String, 
    enum: ['everyone', 'friends', 'private'], 
    default: 'friends' 
  },
  showProfile: { 
    type: String, 
    enum: ['everyone', 'friends', 'private'], 
    default: 'everyone' 
  },
  notifications: {
    convoyInvites: { type: Boolean, default: true },
    friendRequests: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    achievements: { type: Boolean, default: true }
  }
}, { _id: false });

const StatsSchema = new Schema({
  convoysCreated: { type: Number, default: 0 },
  convoysJoined: { type: Number, default: 0 },
  totalMiles: { type: Number, default: 0 },
  friendsCount: { type: Number, default: 0 }
}, { _id: false });

const UserSchema = new Schema<IUser>({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true,
    index: true
  },
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    index: { collation: { locale: 'en', strength: 2 } } // Case-insensitive
  },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String },
  bio: { type: String, maxlength: 500 },
  settings: { type: SettingsSchema, default: () => ({}) },
  friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  blocked: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  lastSeenAt: { type: Date, default: Date.now },
  location: { type: LocationSchema },
  deviceTokens: [{ type: String }],
  stats: { type: StatsSchema, default: () => ({}) },
  deletedAt: { type: Date }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash;
      delete ret.deviceTokens;
      return ret;
    }
  }
});

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ 'location.updatedAt': -1 });
UserSchema.index({ lastSeenAt: -1 });
UserSchema.index({ deletedAt: 1 });

// Soft delete query helpers
UserSchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.methods.updateLastSeen = function() {
  this.lastSeenAt = new Date();
  return this.save();
};

UserSchema.methods.addFriend = function(friendId: Types.ObjectId) {
  if (!this.friends.includes(friendId)) {
    this.friends.push(friendId);
    this.stats.friendsCount = this.friends.length;
  }
  return this.save();
};

UserSchema.methods.removeFriend = function(friendId: Types.ObjectId) {
  this.friends = this.friends.filter(id => !id.equals(friendId));
  this.stats.friendsCount = this.friends.length;
  return this.save();
};

UserSchema.methods.blockUser = function(userId: Types.ObjectId) {
  if (!this.blocked.includes(userId)) {
    this.blocked.push(userId);
  }
  // Remove from friends if they were friends
  this.removeFriend(userId);
  return this.save();
};

UserSchema.methods.unblockUser = function(userId: Types.ObjectId) {
  this.blocked = this.blocked.filter(id => !id.equals(userId));
  return this.save();
};

UserSchema.methods.updateLocation = function(lat: number, lng: number, heading?: number, speed?: number) {
  this.location = {
    lat,
    lng,
    heading,
    speed,
    updatedAt: new Date()
  };
  return this.save();
};

// Static methods
UserSchema.statics.hashPassword = async function(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: null });
};

UserSchema.statics.findByUsername = function(username: string) {
  return this.findOne({ username: username.toLowerCase(), deletedAt: null });
};

UserSchema.statics.searchUsers = function(query: string, excludeIds: Types.ObjectId[] = [], limit = 20) {
  const regex = new RegExp(query, 'i');
  return this.find({
    $and: [
      { deletedAt: null },
      { _id: { $nin: excludeIds } },
      {
        $or: [
          { username: regex },
          { email: regex }
        ]
      }
    ]
  })
  .select('username email avatarUrl bio lastSeenAt')
  .limit(limit)
  .lean();
};

export const User = model<IUser>('User', UserSchema);