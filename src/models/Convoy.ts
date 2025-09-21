import { Schema, model, Types } from 'mongoose';

export interface IConvoyWaypoint {
  lat: number;
  lng: number;
  name?: string;
  order: number;
}

export interface IConvoyRoute {
  waypoints: IConvoyWaypoint[];
  polyline?: string; // Encoded polyline string
  distance?: number; // Total distance in meters
  duration?: number; // Estimated duration in seconds
}

export interface IConvoyLocation {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  updatedAt: Date;
}

export interface IConvoy {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  members: Types.ObjectId[];
  isLive: boolean;
  route?: IConvoyRoute;
  currentCenter: IConvoyLocation;
  visibility: 'public' | 'invite' | 'private';
  joinCode?: string;
  title?: string;
  description?: string;
  maxMembers?: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const ConvoyWaypointSchema = new Schema<IConvoyWaypoint>({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  name: { type: String, maxlength: 100 },
  order: { type: Number, required: true, min: 0 }
}, { _id: false });

const ConvoyRouteSchema = new Schema<IConvoyRoute>({
  waypoints: [ConvoyWaypointSchema],
  polyline: { type: String },
  distance: { type: Number, min: 0 },
  duration: { type: Number, min: 0 }
}, { _id: false });

const ConvoyLocationSchema = new Schema<IConvoyLocation>({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  heading: { type: Number, min: 0, max: 360 },
  speed: { type: Number, min: 0 },
  accuracy: { type: Number, min: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const ConvoySchema = new Schema<IConvoy>({
  ownerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  isLive: { type: Boolean, default: false, index: true },
  route: { type: ConvoyRouteSchema },
  currentCenter: { type: ConvoyLocationSchema, required: true },
  visibility: { 
    type: String, 
    enum: ['public', 'invite', 'private'],
    default: 'public',
    index: true
  },
  joinCode: { type: String, unique: true, sparse: true, index: true },
  title: { type: String, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  maxMembers: { type: Number, min: 2, max: 50, default: 20 },
  startedAt: { type: Date },
  endedAt: { type: Date },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// Indexes
ConvoySchema.index({ ownerId: 1, createdAt: -1 });
ConvoySchema.index({ members: 1 });
ConvoySchema.index({ isLive: 1, visibility: 1 });
ConvoySchema.index({ 'currentCenter.updatedAt': -1 });
ConvoySchema.index({ joinCode: 1 });
ConvoySchema.index({ deletedAt: 1 });

// Compound indexes
ConvoySchema.index({ isLive: 1, visibility: 1, createdAt: -1 });

// Soft delete query helpers
ConvoySchema.query.notDeleted = function() {
  return this.where({ deletedAt: null });
};

ConvoySchema.query.live = function() {
  return this.where({ isLive: true, deletedAt: null });
};

// Instance methods
ConvoySchema.methods.addMember = function(userId: Types.ObjectId) {
  if (!this.members.includes(userId) && this.members.length < (this.maxMembers || 20)) {
    this.members.push(userId);
  }
  return this.save();
};

ConvoySchema.methods.removeMember = function(userId: Types.ObjectId) {
  this.members = this.members.filter(id => !id.equals(userId));
  
  // If owner leaves and there are other members, transfer ownership
  if (this.ownerId.equals(userId) && this.members.length > 0) {
    this.ownerId = this.members[0];
  }
  
  return this.save();
};

ConvoySchema.methods.startConvoy = function() {
  this.isLive = true;
  this.startedAt = new Date();
  return this.save();
};

ConvoySchema.methods.endConvoy = function() {
  this.isLive = false;
  this.endedAt = new Date();
  return this.save();
};

ConvoySchema.methods.updateLocation = function(lat: number, lng: number, heading?: number, speed?: number, accuracy?: number) {
  this.currentCenter = {
    lat,
    lng,
    heading,
    speed,
    accuracy,
    updatedAt: new Date()
  };
  return this.save();
};

ConvoySchema.methods.generateJoinCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.joinCode = result;
  return this.save();
};

ConvoySchema.methods.isMember = function(userId: Types.ObjectId): boolean {
  return this.members.some(id => id.equals(userId));
};

ConvoySchema.methods.isOwner = function(userId: Types.ObjectId): boolean {
  return this.ownerId.equals(userId);
};

// Static methods
ConvoySchema.statics.findLiveConvoys = function(limit = 50) {
  return this.find({
    isLive: true,
    visibility: 'public',
    deletedAt: null
  })
    .populate('ownerId', 'username avatarUrl')
    .populate('members', 'username avatarUrl location')
    .sort({ 'currentCenter.updatedAt': -1 })
    .limit(limit)
    .lean();
};

ConvoySchema.statics.findUserConvoys = function(userId: Types.ObjectId, limit = 20) {
  return this.find({
    $or: [{ ownerId: userId }, { members: userId }],
    deletedAt: null
  })
    .populate('ownerId', 'username avatarUrl')
    .populate('members', 'username avatarUrl')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

ConvoySchema.statics.findByJoinCode = function(joinCode: string) {
  return this.findOne({
    joinCode,
    isLive: true,
    deletedAt: null
  })
    .populate('ownerId', 'username avatarUrl')
    .populate('members', 'username avatarUrl')
    .lean();
};

ConvoySchema.statics.findNearbyConvoys = function(lat: number, lng: number, radiusKm = 50, limit = 20) {
  return this.find({
    isLive: true,
    visibility: 'public',
    deletedAt: null,
    'currentCenter.lat': {
      $gte: lat - (radiusKm / 111), // Rough conversion: 1 degree ≈ 111 km
      $lte: lat + (radiusKm / 111)
    },
    'currentCenter.lng': {
      $gte: lng - (radiusKm / (111 * Math.cos(lat * Math.PI / 180))),
      $lte: lng + (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))
    }
  })
    .populate('ownerId', 'username avatarUrl')
    .populate('members', 'username avatarUrl')
    .sort({ 'currentCenter.updatedAt': -1 })
    .limit(limit)
    .lean();
};

// Pre-save middleware
ConvoySchema.pre('save', function(next) {
  // Ensure owner is always a member
  if (!this.members.includes(this.ownerId)) {
    this.members.unshift(this.ownerId);
  }
  
  // Generate join code for invite-only convoys
  if (this.visibility === 'invite' && !this.joinCode) {
    this.generateJoinCode();
  }
  
  next();
});

export const Convoy = model<IConvoy>('Convoy', ConvoySchema);
