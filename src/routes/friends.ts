import express from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { FriendRequest } from '../models/FriendRequest.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const sendFriendRequestSchema = z.object({
  to: z.string().min(1, 'Recipient is required')
});

const respondFriendRequestSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  action: z.enum(['accept', 'decline', 'block'])
});

const blockUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required')
});

// GET /friends/requests
router.get('/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    
    // Get pending requests (incoming)
    const pendingRequests = await FriendRequest.findPendingRequests(userId);
    
    // Get sent requests (outgoing)
    const sentRequests = await FriendRequest.findSentRequests(userId);

    res.json({
      success: true,
      data: {
        pending: pendingRequests,
        sent: sentRequests
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch friend requests'
      }
    });
  }
});

// POST /friends/request
router.post('/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { to } = sendFriendRequestSchema.parse(req.body);
    const fromId = new Types.ObjectId(req.userId);

    // Resolve recipient by username or ID
    let targetUser;
    if (Types.ObjectId.isValid(to)) {
      targetUser = await User.findById(to);
    } else {
      targetUser = await User.findByUsername(to);
    }

    if (!targetUser) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const toId = targetUser._id;

    // Can't send request to yourself
    if (fromId.equals(toId)) {
      return res.status(400).json({
        error: {
          code: 'CANNOT_FRIEND_SELF',
          message: 'Cannot send friend request to yourself'
        }
      });
    }

    // Check if already friends
    const currentUser = await User.findById(fromId);
    if (currentUser?.friends.includes(toId)) {
      return res.status(409).json({
        error: {
          code: 'ALREADY_FRIENDS',
          message: 'You are already friends with this user'
        }
      });
    }

    // Check if user is blocked
    if (currentUser?.blocked.includes(toId)) {
      return res.status(403).json({
        error: {
          code: 'USER_BLOCKED',
          message: 'Cannot send request to blocked user'
        }
      });
    }

    // Check for existing request
    const existingRequest = await FriendRequest.findExistingRequest(fromId, toId);
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(409).json({
          error: {
            code: 'REQUEST_EXISTS',
            message: 'Friend request already exists'
          }
        });
      }
      if (existingRequest.status === 'blocked') {
        return res.status(403).json({
          error: {
            code: 'REQUEST_BLOCKED',
            message: 'Cannot send request to this user'
          }
        });
      }
    }

    // Create friend request
    const friendRequest = new FriendRequest({
      from: fromId,
      to: toId,
      status: 'pending'
    });

    await friendRequest.save();

    // Create notification for recipient
    await Notification.createFriendRequest(
      toId,
      fromId.toString(),
      currentUser.username
    );

    res.status(201).json({
      success: true,
      data: friendRequest
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
        message: 'Failed to send friend request'
      }
    });
  }
});

// POST /friends/respond
router.post('/respond', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { requestId, action } = respondFriendRequestSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest || !friendRequest.to.equals(userId)) {
      return res.status(404).json({
        error: {
          code: 'REQUEST_NOT_FOUND',
          message: 'Friend request not found'
        }
      });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({
        error: {
          code: 'REQUEST_ALREADY_PROCESSED',
          message: 'Friend request has already been processed'
        }
      });
    }

    // Update request status
    if (action === 'accept') {
      await friendRequest.accept();
      
      // Add to friends list for both users
      await User.findByIdAndUpdate(userId, { $addToSet: { friends: friendRequest.from } });
      await User.findByIdAndUpdate(friendRequest.from, { $addToSet: { friends: userId } });
      
      // Update stats
      await User.findByIdAndUpdate(userId, { $inc: { 'stats.friendsCount': 1 } });
      await User.findByIdAndUpdate(friendRequest.from, { $inc: { 'stats.friendsCount': 1 } });

      // Create notification for sender
      const currentUser = await User.findById(userId);
      await Notification.createFriendAccepted(
        friendRequest.from,
        userId.toString(),
        currentUser?.username || 'Unknown'
      );
    } else if (action === 'decline') {
      await friendRequest.decline();
    } else if (action === 'block') {
      await friendRequest.block();
      
      // Add to blocked list
      await User.findByIdAndUpdate(userId, { $addToSet: { blocked: friendRequest.from } });
    }

    res.json({
      success: true,
      data: friendRequest
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
        message: 'Failed to respond to friend request'
      }
    });
  }
});

// GET /friends/list
router.get('/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const user = await User.findById(req.userId)
      .populate('friends', 'username avatarUrl bio lastSeenAt location')
      .select('friends')
      .lean();

    if (!user) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        friends: user.friends || [],
        count: user.friends?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch friends list'
      }
    });
  }
});

// DELETE /friends/:userId
router.delete('/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { userId } = req.params;
    const currentUserId = new Types.ObjectId(req.userId);
    const targetUserId = new Types.ObjectId(userId);

    // Remove from friends list for both users
    await User.findByIdAndUpdate(currentUserId, { $pull: { friends: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { friends: currentUserId } });

    // Update stats
    await User.findByIdAndUpdate(currentUserId, { $inc: { 'stats.friendsCount': -1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { 'stats.friendsCount': -1 } });

    res.json({
      success: true,
      message: 'Friend removed successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove friend'
      }
    });
  }
});

// POST /friends/block
router.post('/block', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { userId } = blockUserSchema.parse(req.body);
    const currentUserId = new Types.ObjectId(req.userId);
    const targetUserId = new Types.ObjectId(userId);

    if (currentUserId.equals(targetUserId)) {
      return res.status(400).json({
        error: {
          code: 'CANNOT_BLOCK_SELF',
          message: 'Cannot block yourself'
        }
      });
    }

    // Block user
    await User.findByIdAndUpdate(currentUserId, { 
      $addToSet: { blocked: targetUserId },
      $pull: { friends: targetUserId }
    });

    // Remove from target user's friends if they were friends
    await User.findByIdAndUpdate(targetUserId, { 
      $pull: { friends: currentUserId }
    });

    // Update any pending friend requests
    await FriendRequest.updateMany(
      { from: currentUserId, to: targetUserId },
      { status: 'blocked' }
    );

    res.json({
      success: true,
      message: 'User blocked successfully'
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
        message: 'Failed to block user'
      }
    });
  }
});

// POST /friends/unblock
router.post('/unblock', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { userId } = blockUserSchema.parse(req.body);
    const currentUserId = new Types.ObjectId(req.userId);
    const targetUserId = new Types.ObjectId(userId);

    // Unblock user
    await User.findByIdAndUpdate(currentUserId, { 
      $pull: { blocked: targetUserId }
    });

    res.json({
      success: true,
      message: 'User unblocked successfully'
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
        message: 'Failed to unblock user'
      }
    });
  }
});

export default router;
