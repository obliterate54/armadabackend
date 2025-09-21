import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import type { QueryWithHelpers } from 'mongoose';

export type NotificationType = 
  | 'friend_request'
  | 'friend_accepted'
  | 'convoy_invite'
  | 'convoy_join'
  | 'convoy_leave'
  | 'message'
  | 'achievement'
  | 'system';

export interface INotificationPayload {
  // Friend request/acceptance
  friendId?: string;
  friendUsername?: string;
  
  // Convoy related
  convoyId?: string;
  convoyTitle?: string;
  ownerId?: string;
  ownerUsername?: string;
  
  // Message related
  threadId?: string;
  senderId?: string;
  senderUsername?: string;
  messagePreview?: string;
  
  // Achievement
  achievementId?: string;
  achievementTitle?: string;
  
  // System
  title?: string;
  message?: string;
  
  // Generic
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  payload: INotificationPayload;
  readAt?: Date | null;
}

export interface INotificationDoc extends Document, INotification {
  _id: Types.ObjectId;
  markAsRead(): Promise<void>;
  markAsUnread(): Promise<void>;
}

export interface INotificationQueryHelpers {
  // Add any query helpers if needed
}

export interface INotificationModel extends Model<INotificationDoc, INotificationQueryHelpers> {
  findUserNotifications(userId: Types.ObjectId, limit?: number, offset?: number): Promise<INotificationDoc[]>;
  findUnreadNotifications(userId: Types.ObjectId): Promise<INotificationDoc[]>;
  getUnreadCount(userId: Types.ObjectId): Promise<number>;
  markAllAsRead(userId: Types.ObjectId): Promise<any>;
  markMultipleAsRead(notificationIds: Types.ObjectId[], userId: Types.ObjectId): Promise<any>;
  deleteOldNotifications(daysOld?: number): Promise<any>;
  createFriendRequest(userId: Types.ObjectId, friendId: string, friendUsername: string): INotificationDoc;
  createFriendAccepted(userId: Types.ObjectId, friendId: string, friendUsername: string): INotificationDoc;
  createConvoyInvite(userId: Types.ObjectId, convoyId: string, convoyTitle: string, ownerId: string, ownerUsername: string): INotificationDoc;
  createMessage(userId: Types.ObjectId, threadId: string, senderId: string, senderUsername: string, messagePreview: string): INotificationDoc;
  createAchievement(userId: Types.ObjectId, achievementId: string, achievementTitle: string): INotificationDoc;
}

const NotificationPayloadSchema = new Schema<INotificationPayload>({
  friendId: { type: String },
  friendUsername: { type: String },
  convoyId: { type: String },
  convoyTitle: { type: String },
  ownerId: { type: String },
  ownerUsername: { type: String },
  threadId: { type: String },
  senderId: { type: String },
  senderUsername: { type: String },
  messagePreview: { type: String, maxlength: 100 },
  achievementId: { type: String },
  achievementTitle: { type: String },
  title: { type: String, maxlength: 100 },
  message: { type: String, maxlength: 500 },
  actionUrl: { type: String },
  metadata: { type: Schema.Types.Mixed }
}, { _id: false });

const NotificationSchema = new Schema<INotificationDoc, INotificationModel, INotificationDoc, INotificationQueryHelpers>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    enum: [
      'friend_request',
      'friend_accepted', 
      'convoy_invite',
      'convoy_join',
      'convoy_leave',
      'message',
      'achievement',
      'system'
    ],
    required: true,
    index: true
  },
  payload: { type: NotificationPayloadSchema, required: true },
  readAt: { type: Date, index: true }
}, {
  timestamps: true
});

// Indexes
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index({ type: 1, createdAt: -1 });

// Instance methods
NotificationSchema.methods.markAsRead = async function(): Promise<void> {
  this.readAt = new Date();
  await this.save();
};

NotificationSchema.methods.markAsUnread = async function(): Promise<void> {
  this.readAt = null;
  await this.save();
};

// Static methods
NotificationSchema.statics.findUserNotifications = function(
  userId: Types.ObjectId, 
  limit = 50, 
  offset = 0
): Promise<INotificationDoc[]> {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
};

NotificationSchema.statics.findUnreadNotifications = function(userId: Types.ObjectId): Promise<INotificationDoc[]> {
  return this.find({ userId, readAt: null })
    .sort({ createdAt: -1 })
    .lean();
};

NotificationSchema.statics.getUnreadCount = function(userId: Types.ObjectId): Promise<number> {
  return this.countDocuments({ userId, readAt: null });
};

NotificationSchema.statics.markAllAsRead = function(userId: Types.ObjectId): Promise<any> {
  return this.updateMany(
    { userId, readAt: null },
    { readAt: new Date() }
  );
};

NotificationSchema.statics.markMultipleAsRead = function(
  notificationIds: Types.ObjectId[], 
  userId: Types.ObjectId
): Promise<any> {
  return this.updateMany(
    { _id: { $in: notificationIds }, userId },
    { readAt: new Date() }
  );
};

NotificationSchema.statics.deleteOldNotifications = function(daysOld = 30): Promise<any> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    createdAt: { $lt: cutoffDate }
  });
};

// Factory methods for creating common notifications
NotificationSchema.statics.createFriendRequest = function(
  userId: Types.ObjectId, 
  friendId: string, 
  friendUsername: string
): INotificationDoc {
  return new this({
    userId,
    type: 'friend_request',
    payload: {
      friendId,
      friendUsername,
      title: 'New Friend Request',
      message: `${friendUsername} sent you a friend request`
    }
  });
};

NotificationSchema.statics.createFriendAccepted = function(
  userId: Types.ObjectId, 
  friendId: string, 
  friendUsername: string
): INotificationDoc {
  return new this({
    userId,
    type: 'friend_accepted',
    payload: {
      friendId,
      friendUsername,
      title: 'Friend Request Accepted',
      message: `${friendUsername} accepted your friend request`
    }
  });
};

NotificationSchema.statics.createConvoyInvite = function(
  userId: Types.ObjectId,
  convoyId: string,
  convoyTitle: string,
  ownerId: string,
  ownerUsername: string
): INotificationDoc {
  return new this({
    userId,
    type: 'convoy_invite',
    payload: {
      convoyId,
      convoyTitle,
      ownerId,
      ownerUsername,
      title: 'Convoy Invitation',
      message: `${ownerUsername} invited you to join "${convoyTitle}"`
    }
  });
};

NotificationSchema.statics.createMessage = function(
  userId: Types.ObjectId,
  threadId: string,
  senderId: string,
  senderUsername: string,
  messagePreview: string
): INotificationDoc {
  return new this({
    userId,
    type: 'message',
    payload: {
      threadId,
      senderId,
      senderUsername,
      messagePreview,
      title: 'New Message',
      message: `${senderUsername}: ${messagePreview}`
    }
  });
};

NotificationSchema.statics.createAchievement = function(
  userId: Types.ObjectId,
  achievementId: string,
  achievementTitle: string
): INotificationDoc {
  return new this({
    userId,
    type: 'achievement',
    payload: {
      achievementId,
      achievementTitle,
      title: 'Achievement Unlocked!',
      message: `You unlocked: ${achievementTitle}`
    }
  });
};

export const Notification = (mongoose.models.Notification as INotificationModel) || mongoose.model<INotificationDoc, INotificationModel>('Notification', NotificationSchema);