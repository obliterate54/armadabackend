import express from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Convoy } from '../models/Convoy.js';
import { User } from '../models/User.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const createConvoySchema = z.object({
  title: z.string().max(100, 'Title too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  visibility: z.enum(['public', 'invite', 'private']).default('public'),
  maxMembers: z.number().min(2).max(50).default(20),
  route: z.object({
    waypoints: z.array(z.object({
      lat: z.number(),
      lng: z.number(),
      name: z.string().optional(),
      order: z.number().min(0)
    })).optional(),
    polyline: z.string().optional(),
    distance: z.number().min(0).optional(),
    duration: z.number().min(0).optional()
  }).optional(),
  currentCenter: z.object({
    lat: z.number(),
    lng: z.number(),
    heading: z.number().min(0).max(360).optional(),
    speed: z.number().min(0).optional(),
    accuracy: z.number().min(0).optional()
  }).required()
});

const updateLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().min(0).optional()
});

const joinConvoySchema = z.object({
  joinCode: z.string().optional()
});

// GET /convoys
router.get('/', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit = '50', offset = '0', lat, lng, radius = '50' } = req.query;
    const parsedLimit = Math.max(1, Math.min(100, Number(limit)));
    const parsedOffset = Math.max(0, Number(offset));

    let convoys;

    if (lat && lng) {
      // Get nearby convoys
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);
      const parsedRadius = Number(radius);
      
      convoys = await Convoy.findNearbyConvoys(parsedLat, parsedLng, parsedRadius, parsedLimit + parsedOffset);
    } else {
      // Get live public convoys
      convoys = await Convoy.findLiveConvoys(parsedLimit + parsedOffset);
    }

    const paginatedConvoys = convoys.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      success: true,
      data: {
        convoys: paginatedConvoys,
        pagination: {
          limit: parsedLimit,
          offset: parsedOffset,
          total: convoys.length,
          hasMore: convoys.length > parsedOffset + parsedLimit
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch convoys'
      }
    });
  }
});

// POST /convoys
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

    const convoyData = createConvoySchema.parse(req.body);
    const ownerId = new Types.ObjectId(req.userId);

    // Create convoy
    const convoy = new Convoy({
      ownerId,
      members: [ownerId],
      isLive: false,
      ...convoyData
    });

    await convoy.save();

    // Populate owner info
    await convoy.populate('ownerId', 'username avatarUrl');

    res.status(201).json({
      success: true,
      data: convoy
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
        message: 'Failed to create convoy'
      }
    });
  }
});

// GET /convoys/:id
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId ? new Types.ObjectId(req.userId) : null;

    const convoy = await Convoy.findById(id)
      .populate('ownerId', 'username avatarUrl')
      .populate('members', 'username avatarUrl location')
      .lean();

    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check visibility permissions
    if (convoy.visibility === 'private' && (!userId || !convoy.members.some(m => (m as any)._id.equals(userId)))) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'This convoy is private'
        }
      });
    }

    res.json({
      success: true,
      data: convoy
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch convoy'
      }
    });
  }
});

// PATCH /convoys/:id
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const updates = createConvoySchema.partial().parse(req.body);

    const convoy = await Convoy.findById(id);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check if user is owner
    if (!convoy.isOwner(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'Only the convoy owner can update convoy details'
        }
      });
    }

    // Update convoy
    Object.assign(convoy, updates);
    await convoy.save();

    res.json({
      success: true,
      data: convoy
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
        message: 'Failed to update convoy'
      }
    });
  }
});

// POST /convoys/:id/join
router.post('/:id/join', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const { joinCode } = joinConvoySchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    let convoy;
    
    if (joinCode) {
      convoy = await Convoy.findByJoinCode(joinCode);
      if (!convoy) {
        return res.status(404).json({
          error: {
            code: 'INVALID_JOIN_CODE',
            message: 'Invalid join code'
          }
        });
      }
    } else {
      convoy = await Convoy.findById(id);
      if (!convoy) {
        return res.status(404).json({
          error: {
            code: 'CONVOY_NOT_FOUND',
            message: 'Convoy not found'
          }
        });
      }
    }

    // Check if already a member
    if (convoy.isMember(userId)) {
      return res.status(409).json({
        error: {
          code: 'ALREADY_MEMBER',
          message: 'You are already a member of this convoy'
        }
      });
    }

    // Check convoy capacity
    if (convoy.members.length >= convoy.maxMembers) {
      return res.status(400).json({
        error: {
          code: 'CONVOY_FULL',
          message: 'Convoy is at maximum capacity'
        }
      });
    }

    // Check visibility
    if (convoy.visibility === 'invite' && !joinCode) {
      return res.status(403).json({
        error: {
          code: 'INVITE_REQUIRED',
          message: 'This convoy requires an invite code'
        }
      });
    }

    // Add user to convoy
    await convoy.addMember(userId);

    // Update user stats
    await User.findByIdAndUpdate(userId, { $inc: { 'stats.convoysJoined': 1 } });

    res.json({
      success: true,
      message: 'Successfully joined convoy',
      data: convoy
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
        message: 'Failed to join convoy'
      }
    });
  }
});

// POST /convoys/:id/leave
router.post('/:id/leave', requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const convoy = await Convoy.findById(id);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check if user is a member
    if (!convoy.isMember(userId)) {
      return res.status(400).json({
        error: {
          code: 'NOT_MEMBER',
          message: 'You are not a member of this convoy'
        }
      });
    }

    // Remove user from convoy
    await convoy.removeMember(userId);

    // If convoy becomes empty, end it
    if (convoy.members.length === 0) {
      await convoy.endConvoy();
    }

    res.json({
      success: true,
      message: 'Successfully left convoy'
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to leave convoy'
      }
    });
  }
});

// POST /convoys/:id/start
router.post('/:id/start', requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const convoy = await Convoy.findById(id);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check if user is owner
    if (!convoy.isOwner(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'Only the convoy owner can start the convoy'
        }
      });
    }

    // Start convoy
    await convoy.startConvoy();

    res.json({
      success: true,
      message: 'Convoy started successfully',
      data: convoy
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to start convoy'
      }
    });
  }
});

// POST /convoys/:id/end
router.post('/:id/end', requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const convoy = await Convoy.findById(id);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check if user is owner
    if (!convoy.isOwner(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'Only the convoy owner can end the convoy'
        }
      });
    }

    // End convoy
    await convoy.endConvoy();

    res.json({
      success: true,
      message: 'Convoy ended successfully',
      data: convoy
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to end convoy'
      }
    });
  }
});

// POST /convoys/:id/location
router.post('/:id/location', requireAuth, async (req: AuthenticatedRequest, res) => {
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
    const locationData = updateLocationSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    const convoy = await Convoy.findById(id);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'CONVOY_NOT_FOUND',
          message: 'Convoy not found'
        }
      });
    }

    // Check if user is a member
    if (!convoy.isMember(userId)) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You are not a member of this convoy'
        }
      });
    }

    // Update convoy location
    await convoy.updateLocation(
      locationData.lat,
      locationData.lng,
      locationData.heading,
      locationData.speed,
      locationData.accuracy
    );

    // Update user location
    await User.findByIdAndUpdate(userId, {
      $set: {
        'location.lat': locationData.lat,
        'location.lng': locationData.lng,
        'location.heading': locationData.heading,
        'location.speed': locationData.speed,
        'location.updatedAt': new Date()
      }
    });

    res.json({
      success: true,
      message: 'Location updated successfully'
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
        message: 'Failed to update location'
      }
    });
  }
});

// GET /convoys/join/:joinCode
router.get('/join/:joinCode', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const { joinCode } = req.params;

    const convoy = await Convoy.findByJoinCode(joinCode);
    if (!convoy) {
      return res.status(404).json({
        error: {
          code: 'INVALID_JOIN_CODE',
          message: 'Invalid join code'
        }
      });
    }

    res.json({
      success: true,
      data: convoy
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch convoy by join code'
      }
    });
  }
});

export default router;
