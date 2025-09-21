import express from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Thread } from '../models/Thread.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const createThreadSchema = z.object({
  participants: z.array(z.string()).min(2, 'At least 2 participants required').max(50, 'Too many participants'),
  title: z.string().max(100, 'Title too long').optional(),
  isGroup: z.boolean().default(false)
});

const sendMessageSchema = z.object({
  text: z.string().max(2000, 'Message too long').optional(),
  media: z.object({
    url: z.string().url('Invalid media URL'),
    type: z.enum(['image', 'video', 'audio']),
    width: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    duration: z.number().min(0).optional(),
    filename: z.string().optional(),
    size: z.number().min(0).optional()
  }).optional()
}).refine(data => data.text || data.media, {
  message: 'Message must have either text or media'
});

const markAsReadSchema = z.object({
  lastReadAt: z.coerce.date().optional()
});

// GET /threads
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

    const userId = new Types.ObjectId(req.userId);
    const { limit = '50', offset = '0' } = req.query;
    const parsedLimit = Math.max(1, Math.min(100, Number(limit)));
    const parsedOffset = Math.max(0, Number(offset));

    const threads = await Thread.findUserThreads(userId, parsedLimit + parsedOffset);
    const paginatedThreads = threads.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      success: true,
      data: {
        threads: paginatedThreads,
        pagination: {
          limit: parsedLimit,
          offset: parsedOffset,
          total: threads.length,
          hasMore: threads.length > parsedOffset + parsedLimit
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch threads'
      }
    });
  }
});

// POST /threads
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { participants, title, isGroup } = createThreadSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    // Validate participants
    const participantIds = participants.map(id => new Types.ObjectId(id));
    
    // Ensure current user is included
    if (!participantIds.some(id => id.equals(userId))) {
      participantIds.unshift(userId);
    }

    // Check if users exist
    const users = await User.find({ _id: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PARTICIPANTS',
          message: 'One or more participants not found'
        }
      });
    }

    let thread;

    if (isGroup) {
      // Create group thread
      thread = Thread.createGroupThread(participantIds, title);
      await thread.save();
    } else {
      // For DM, find existing or create new
      const otherParticipant = participantIds.find(id => !id.equals(userId));
      if (!otherParticipant) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARTICIPANTS',
            message: 'DM requires exactly 2 participants'
          }
        });
      }

      thread = await Thread.findOrCreateDM(userId, otherParticipant);
    }

    res.status(201).json({
      success: true,
      data: thread
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
        message: 'Failed to create thread'
      }
    });
  }
});

// GET /threads/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const thread = await Thread.findById(id)
      .populate('participants', 'username avatarUrl lastSeenAt')
      .lean();

    if (!thread) {
      return res.status(404).json({
        error: {
          code: 'THREAD_NOT_FOUND',
          message: 'Thread not found'
        }
      });
    }

    // Check if user is participant
    const isParticipant = thread.participants.some(p => 
      (p as any)._id.toString() === req.userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a participant of this thread'
        }
      });
    }

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch thread'
      }
    });
  }
});

// GET /threads/:id/messages
router.get('/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const { cursor, limit = '50' } = req.query;
    const userId = new Types.ObjectId(req.userId);
    const parsedLimit = Math.max(1, Math.min(100, Number(limit)));

    // Verify user is participant
    const thread = await Thread.findById(id);
    if (!thread || !thread.participants.includes(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a participant of this thread'
        }
      });
    }

    const cursorDate = cursor ? new Date(cursor as string) : undefined;
    const messages = await Message.findByThread(new Types.ObjectId(id), cursorDate, parsedLimit);

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Return in chronological order
        pagination: {
          limit: parsedLimit,
          hasMore: messages.length === parsedLimit,
          nextCursor: messages.length > 0 ? messages[0]?.createdAt : undefined
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch messages'
      }
    });
  }
});

// POST /threads/:id/messages
router.post('/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const messageData = sendMessageSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    // Verify user is participant
    const thread = await Thread.findById(id);
    if (!thread || !thread.participants.includes(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a participant of this thread'
        }
      });
    }

    // Create message
    const message = new Message({
      threadId: new Types.ObjectId(id),
      senderId: userId,
      text: messageData.text,
      media: messageData.media
    });

    await message.save();

    // Update thread last message and unread counts
    await thread.updateLastMessage();
    
    // Increment unread count for other participants
    const otherParticipants = thread.participants.filter(id => !id.equals(userId));
    for (const participantId of otherParticipants) {
      await thread.incrementUnread(participantId);
    }

    // Populate sender info
    await message.populate('senderId', 'username avatarUrl');

    res.status(201).json({
      success: true,
      data: message
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
        message: 'Failed to send message'
      }
    });
  }
});

// POST /threads/:id/read
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const { lastReadAt } = markAsReadSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    // Verify user is participant
    const thread = await Thread.findById(id);
    if (!thread || !thread.participants.includes(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a participant of this thread'
        }
      });
    }

    // Mark as read
    await thread.markAsRead(userId);

    res.json({
      success: true,
      message: 'Thread marked as read'
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
        message: 'Failed to mark thread as read'
      }
    });
  }
});

// DELETE /threads/:id
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

    const thread = await Thread.findById(id);
    if (!thread) {
      return res.status(404).json({
        error: {
          code: 'THREAD_NOT_FOUND',
          message: 'Thread not found'
        }
      });
    }

    // Check if user is participant
    if (!thread.participants.includes(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a participant of this thread'
        }
      });
    }

    // Soft delete thread
    thread.deletedAt = new Date();
    await thread.save();

    res.json({
      success: true,
      message: 'Thread deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete thread'
      }
    });
  }
});

export default router;
