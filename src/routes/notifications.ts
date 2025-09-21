import express from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Notification } from '../models/Notification.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const markAsReadSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  markAll: z.boolean().default(false)
});

const getNotificationsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false)
});

// GET /notifications
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { limit, offset, unreadOnly } = getNotificationsSchema.parse(req.query);
    const userId = new Types.ObjectId(req.userId);

    let notifications;
    let total;

    if (unreadOnly) {
      notifications = await Notification.findUnreadNotifications(userId);
      total = notifications.length;
    } else {
      notifications = await Notification.findUserNotifications(userId, limit, offset);
      // For total count, we'd need a separate query
      total = notifications.length; // This is approximate
    }

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          limit,
          offset,
          total,
          hasMore: notifications.length === limit
        }
      }
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch notifications'
      }
    });
  }
});

// GET /notifications/unread-count
router.get('/unread-count', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const userId = new Types.ObjectId(req.userId);
    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch unread count'
      }
    });
  }
});

// POST /notifications/read
router.post('/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { notificationIds, markAll } = markAsReadSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    if (markAll) {
      await Notification.markAllAsRead(userId);
    } else if (notificationIds && notificationIds.length > 0) {
      const objectIds = notificationIds.map(id => new Types.ObjectId(id));
      await Notification.markMultipleAsRead(objectIds, userId);
    } else {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either notificationIds or markAll must be provided'
        }
      });
    }

    res.json({
      success: true,
      message: 'Notifications marked as read'
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to mark notifications as read'
      }
    });
  }
});

// DELETE /notifications/:id
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { id } = req.params;
    const userId = new Types.ObjectId(req.userId);

    const notification = await Notification.findOneAndDelete({
      _id: new Types.ObjectId(id),
      userId
    });

    if (!notification) {
      return res.status(404).json({
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found'
        }
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete notification'
      }
    });
  }
});

export default router;
