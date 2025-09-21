import express from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const updateProfileSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
  settings: z.object({
    showConvoys: z.enum(['everyone', 'friends', 'private']).optional(),
    showStats: z.enum(['everyone', 'friends', 'private']).optional(),
    showProfile: z.enum(['everyone', 'friends', 'private']).optional(),
    notifications: z.object({
      convoyInvites: z.boolean().optional(),
      friendRequests: z.boolean().optional(),
      messages: z.boolean().optional(),
      achievements: z.boolean().optional()
    }).optional()
  }).optional()
});

const searchUsersSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0)
});

// GET /users/me
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
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
      .populate('friends', 'username avatarUrl lastSeenAt')
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
      data: user
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch user profile'
      }
    });
  }
});

// PATCH /users/me
router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const updates = updateProfileSchema.parse(req.body);
    
    // Check username uniqueness if being updated
    if (updates.username) {
      const existingUser = await User.findOne({
        username: updates.username.toLowerCase(),
        _id: { $ne: req.userId }
      });
      
      if (existingUser) {
        return res.status(409).json({
          error: {
            code: 'USERNAME_TAKEN',
            message: 'Username is already taken'
          }
        });
      }
      
      updates.username = updates.username.toLowerCase();
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

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
      data: user
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
        message: 'Failed to update profile'
      }
    });
  }
});

// GET /users/:id
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .select('username avatarUrl bio settings.stats createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Check privacy settings
    if (user.settings?.showProfile === 'private' && (!req.userId || req.userId !== id)) {
      return res.status(403).json({
        error: {
          code: 'PRIVATE_PROFILE',
          message: 'This profile is private'
        }
      });
    }

    // Filter stats based on privacy settings
    if (user.settings?.showStats === 'private' && (!req.userId || req.userId !== id)) {
      user.stats = {
        convoysCreated: 0,
        convoysJoined: 0,
        totalMiles: 0,
        friendsCount: 0
      };
    } else if (user.settings?.showStats === 'friends' && (!req.userId || req.userId !== id)) {
      // TODO: Check if users are friends
      user.stats = {
        convoysCreated: 0,
        convoysJoined: 0,
        totalMiles: 0,
        friendsCount: 0
      };
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch user'
      }
    });
  }
});

// GET /users/by-username/:username
router.get('/by-username/:username', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({
        error: {
          code: 'MISSING_USERNAME',
          message: 'Username parameter is required'
        }
      });
    }
    
    const user = await User.findOne({ username: username.toLowerCase() })
      .select('username avatarUrl bio settings stats createdAt')
      .exec();

    if (!user) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Check privacy settings
    if (user.settings?.showProfile === 'private' && (!req.userId || req.userId !== user._id.toString())) {
      return res.status(403).json({
        error: {
          code: 'PRIVATE_PROFILE',
          message: 'This profile is private'
        }
      });
    }

    // Filter stats based on privacy settings
    if (user.settings?.showStats === 'private' && (!req.userId || req.userId !== user._id.toString())) {
      user.stats = {
        convoysCreated: 0,
        convoysJoined: 0,
        totalMiles: 0,
        friendsCount: 0
      };
    } else if (user.settings?.showStats === 'friends' && (!req.userId || req.userId !== user._id.toString())) {
      // TODO: Check if users are friends
      user.stats = {
        convoysCreated: 0,
        convoysJoined: 0,
        totalMiles: 0,
        friendsCount: 0
      };
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch user'
      }
    });
  }
});

// GET /users/search
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { q, limit, offset } = searchUsersSchema.parse(req.query);
    
    // Get current user's friends and blocked users to exclude from search
    const currentUser = await User.findById(req.userId).select('friends blocked').lean();
    const excludeIds = [
      new Types.ObjectId(req.userId),
      ...(currentUser?.friends || []),
      ...(currentUser?.blocked || [])
    ];

    const users = await User.searchUsers(q, excludeIds, limit);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          limit,
          offset,
          total: users.length,
          hasMore: users.length === limit
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
        message: 'Search failed'
      }
    });
  }
});

export default router;
