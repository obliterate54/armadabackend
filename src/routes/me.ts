import express from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schema
const updateMeSchema = z.object({
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

// GET /me
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

// PATCH /me
router.patch('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const updates = updateMeSchema.parse(req.body);
    
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

export default router;
