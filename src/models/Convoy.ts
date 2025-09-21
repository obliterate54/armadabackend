import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';

export interface IConvoy {
  ownerId: Types.ObjectId;
  members: Types.ObjectId[];
  title?: string;
  description?: string;
  isLive: boolean;
  visibility: 'public' | 'invite' | 'private';
  maxMembers: number;
  joinCode?: string | null;
  route?: {
    waypoints: Array<{
      lat: number;
      lng: number;
      name?: string;
      order: number;
    }>;
    polyline?: string;
    distance?: number;
    duration?: number;
  };
  currentCenter?: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    updatedAt: Date;
  };
  startedAt?: Date;
  endedAt?: Date;
  deletedAt?: Date | null;
}

export interface IConvoyDoc extends Document, IConvoy {
  _id: Types.ObjectId;
  isOwner(userId: Types.ObjectId): boolean;
  isMember(userId: Types.ObjectId): boolean;
  addMember(userId: Types.ObjectId): Promise<void>;
  removeMember(userId: Types.ObjectId): Promise<void>;
  startConvoy(): Promise<void>;
  endConvoy(): Promise<void>;
  updateLocation(lat: number, lng: number, heading?: number, speed?: number, accuracy?: number): Promise<void>;
  generateJoinCode(): void;
}

export interface IConvoyQueryHelpers {
  notDeleted(this: QueryWithHelpers<any, IConvoyDoc, IConvoyQueryHelpers>): any;
  live(this: QueryWithHelpers<any, IConvoyDoc, IConvoyQueryHelpers>): any;
}

export interface IConvoyModel extends Model<IConvoyDoc, IConvoyQueryHelpers> {
  findNearbyConvoys(lat: number, lng: number, radiusKm: number, limit: number): Promise<IConvoyDoc[]>;
  findLiveConvoys(limit: number): Promise<IConvoyDoc[]>;
  findByJoinCode(code: string): Promise<IConvoyDoc | null>;
}

const ConvoyWaypointSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  name: String,
  order: { type: Number, required: true }
}, { _id: false });

const ConvoyRouteSchema = new Schema({
  waypoints: [ConvoyWaypointSchema],
  polyline: String,
  distance: Number,
  duration: Number
}, { _id: false });

const ConvoyLocationSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  heading: { type: Number, min: 0, max: 360 },
  speed: { type: Number, min: 0 },
  accuracy: { type: Number, min: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const ConvoySchema = new Schema<IConvoyDoc, IConvoyModel, IConvoyDoc, IConvoyQueryHelpers>({
  ownerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  title: { type: String, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  isLive: { type: Boolean, default: false, index: true },
  visibility: { 
    type: String, 
    enum: ['public', 'invite', 'private'], 
    default: 'public' 
  },
  maxMembers: { type: Number, min: 2, max: 50, default: 20 },
  joinCode: { type: String, unique: true, index: true, sparse: true },
  route: { type: ConvoyRouteSchema },
  currentCenter: { type: ConvoyLocationSchema },
  startedAt: { type: Date },
  endedAt: { type: Date },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Indexes
ConvoySchema.index({ isLive: 1, updatedAt: -1 });
ConvoySchema.index({ 'currentCenter.updatedAt': -1 });
ConvoySchema.index({ deletedAt: 1 });

// Query helpers
ConvoySchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

ConvoySchema.query.live = function() {
  return this.where({ isLive: true, deletedAt: null });
};

// Instance methods
ConvoySchema.methods.isOwner = function(userId: Types.ObjectId): boolean {
  return this.ownerId.equals(userId);
};

ConvoySchema.methods.isMember = function(userId: Types.ObjectId): boolean {
  return this.members.some((id: Types.ObjectId) => id.equals(userId));
};

ConvoySchema.methods.addMember = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.isMember(userId) && this.members.length < this.maxMembers) {
    this.members.push(userId);
    await this.save();
  }
};

ConvoySchema.methods.removeMember = async function(userId: Types.ObjectId): Promise<void> {
  this.members = this.members.filter((id: Types.ObjectId) => !id.equals(userId));
  await this.save();
};

ConvoySchema.methods.startConvoy = async function(): Promise<void> {
  this.isLive = true;
  this.startedAt = new Date();
  await this.save();
};

ConvoySchema.methods.endConvoy = async function(): Promise<void> {
  this.isLive = false;
  this.endedAt = new Date();
  await this.save();
};

ConvoySchema.methods.updateLocation = async function(
  lat: number, 
  lng: number, 
  heading?: number, 
  speed?: number, 
  accuracy?: number
): Promise<void> {
  this.currentCenter = {
    lat,
    lng,
    updatedAt: new Date(),
    ...(heading != null ? { heading } : {}),
    ...(speed != null ? { speed } : {}),
    ...(accuracy != null ? { accuracy } : {})
  };
  await this.save();
};

ConvoySchema.methods.generateJoinCode = function(): void {
  this.joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
};

// Static methods
ConvoySchema.statics.findNearbyConvoys = function(
  lat: number, 
  lng: number, 
  radiusKm: number, 
  limit: number
): Promise<IConvoyDoc[]> {
  const delta = radiusKm / 111; // Approximate degrees per km
  return this.find({
    isLive: true,
    'currentCenter.lat': { $gte: lat - delta, $lte: lat + delta },
    'currentCenter.lng': { $gte: lng - delta, $lte: lng + delta },
    deletedAt: null
  })
  .populate('ownerId', 'username avatarUrl')
  .populate('members', 'username avatarUrl')
  .limit(limit)
  .lean();
};

ConvoySchema.statics.findLiveConvoys = function(limit: number): Promise<IConvoyDoc[]> {
  return this.find({ isLive: true, deletedAt: null })
    .populate('ownerId', 'username avatarUrl')
    .populate('members', 'username avatarUrl')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
};

ConvoySchema.statics.findByJoinCode = function(code: string): Promise<IConvoyDoc | null> {
  return this.findOne({ 
    joinCode: code.toUpperCase(), 
    deletedAt: null 
  })
  .populate('ownerId', 'username avatarUrl')
  .populate('members', 'username avatarUrl');
};

export const Convoy = (mongoose.models.Convoy as IConvoyModel) || mongoose.model<IConvoyDoc, IConvoyModel>('Convoy', ConvoySchema);