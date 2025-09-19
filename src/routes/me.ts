import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'UserNotFound' });
    }
    
    res.json({
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      photoURL: user.photoURL,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Error in GET /me:', error);
    res.status(500).json({ error: 'InternalServerError' });
  }
});

r.post('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const body = z.object({
      displayName: z.string().min(1).max(50).optional(),
      username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/i).optional(),
      photoURL: z.string().url().optional(),
    }).parse(req.body);

    if (body.username) {
      const clash = await User.findOne({ 
        username: new RegExp(`^${body.username}$`, 'i'), 
        _id: { $ne: userId } 
      });
      if (clash) return res.status(409).json({ error: 'UsernameTaken' });
    }

    const $set: any = { updatedAt: new Date() };
    if (typeof body.displayName !== 'undefined') $set.displayName = body.displayName;
    if (typeof body.username !== 'undefined') $set.username = body.username;
    if (typeof body.photoURL !== 'undefined') $set.photoURL = body.photoURL;

    const user = await User.findByIdAndUpdate(userId, { $set }, { new: true });
    
    if (!user) {
      return res.status(404).json({ error: 'UserNotFound' });
    }
    
    res.json({
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      photoURL: user.photoURL,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Error in POST /me:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'InvalidInput', details: error.errors });
    }
    res.status(500).json({ error: 'InternalServerError' });
  }
});

export default r;