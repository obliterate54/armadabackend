import { Schema, model, Types } from 'mongoose';

export interface IDeviceToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  appVersion?: string;
  osVersion?: string;
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  token: { 
    type: String, 
    unique: true, 
    required: true,
    index: true
  },
  platform: { 
    type: String, 
    enum: ['ios', 'android', 'web'],
    required: true,
    index: true
  },
  deviceId: { type: String },
  appVersion: { type: String },
  osVersion: { type: String },
  isActive: { type: Boolean, default: true, index: true },
  lastUsedAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

// Indexes
DeviceTokenSchema.index({ userId: 1, platform: 1 });
DeviceTokenSchema.index({ userId: 1, isActive: 1 });
DeviceTokenSchema.index({ lastUsedAt: -1 });

// Static methods
DeviceTokenSchema.statics.findUserTokens = function(userId: Types.ObjectId) {
  return this.find({ userId, isActive: true })
    .sort({ lastUsedAt: -1 })
    .lean();
};

DeviceTokenSchema.statics.findByToken = function(token: string) {
  return this.findOne({ token, isActive: true })
    .populate('userId', 'username email')
    .lean();
};

DeviceTokenSchema.statics.deactivateToken = function(token: string) {
  return this.updateOne({ token }, { isActive: false });
};

DeviceTokenSchema.statics.deactivateUserTokens = function(userId: Types.ObjectId) {
  return this.updateMany({ userId }, { isActive: false });
};

DeviceTokenSchema.statics.updateLastUsed = function(token: string) {
  return this.updateOne({ token }, { lastUsedAt: new Date() });
};

DeviceTokenSchema.statics.cleanupOldTokens = function(daysOld = 90) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    lastUsedAt: { $lt: cutoffDate }
  });
};

export const DeviceToken = model<IDeviceToken>('DeviceToken', DeviceTokenSchema);
