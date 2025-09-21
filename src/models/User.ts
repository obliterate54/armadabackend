import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
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
  deletedAt?: Date | null;
}

export interface IUserDoc extends Document, IUser {
  _id: Types.ObjectId;
  comparePassword(candidatePassword: string): Promise<boolean>;
  updateLastSeen(): Promise<void>;
  addFriend(friendId: Types.ObjectId): Promise<void>;
  removeFriend(friendId: Types.ObjectId): Promise<void>;
  blockUser(userId: Types.ObjectId): Promise<void>;
  unblockUser(userId: Types.ObjectId): Promise<void>;
  updateLocation(lat: number, lng: number, heading?: number, speed?: number): Promise<void>;
}

export interface IUserQueryHelpers {
  notDeleted(this: QueryWithHelpers<any, IUserDoc, IUserQueryHelpers>): any;
}

export interface IUserModel extends Model<IUserDoc, IUserQueryHelpers> {
  findByEmail(email: string): Promise<IUserDoc | null>;
  findByUsername(username: string): Promise<IUserDoc | null>;
  searchUsers(query: string, excludeIds?: Types.ObjectId[], limit?: number): Promise<IUserDoc[]>;
  hashPassword(password: string): Promise<string>;
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

const UserSchema = new Schema<IUserDoc, IUserModel, IUserDoc, IUserQueryHelpers>({
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
    index: { collation: { locale: 'en', strength: 2 } }
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
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: {
    transform: function(_doc, ret: any) {
      if ('passwordHash' in ret) delete ret.passwordHash;
      if ('deviceTokens' in ret) delete ret.deviceTokens;
      return ret;
    }
  }
});

// Indexes for performance
UserSchema.index({ 'location.updatedAt': -1 });
UserSchema.index({ lastSeenAt: -1 });

// Query helpers
UserSchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.methods.updateLastSeen = async function() {
  this.lastSeenAt = new Date();
  await this.save();
};

UserSchema.methods.addFriend = async function(friendId: Types.ObjectId) {
  if (!this.friends.includes(friendId)) {
    this.friends.push(friendId);
    this.stats.friendsCount = this.friends.length;
  }
  await this.save();
};

UserSchema.methods.removeFriend = async function(friendId: Types.ObjectId) {
  this.friends = this.friends.filter((id: Types.ObjectId) => !id.equals(friendId));
  this.stats.friendsCount = this.friends.length;
  await this.save();
};

UserSchema.methods.blockUser = async function(userId: Types.ObjectId) {
  if (!this.blocked.includes(userId)) {
    this.blocked.push(userId);
  }
  await this.removeFriend(userId);
};

UserSchema.methods.unblockUser = async function(userId: Types.ObjectId) {
  this.blocked = this.blocked.filter((id: Types.ObjectId) => !id.equals(userId));
  await this.save();
};

UserSchema.methods.updateLocation = async function(lat: number, lng: number, heading?: number, speed?: number) {
  this.location = {
    lat,
    lng,
    updatedAt: new Date(),
    ...(heading != null ? { heading } : {}),
    ...(speed != null ? { speed } : {})
  };
  await this.save();
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

export const User = (mongoose.models.User as IUserModel) || mongoose.model<IUserDoc, IUserModel>('User', UserSchema);