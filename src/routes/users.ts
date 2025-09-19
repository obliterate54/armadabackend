import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';

const r = Router();

r.get('/users/by-username/:username', requireAuth, async (req, res) => {
  const { username } = z.object({ username: z.string().min(1).max(32) }).parse(req.params);
  const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') }).lean();
  if (!user) return res.status(404).json({ error: 'UserNotFound' });
  res.json({ uid: user._id.toString(), displayName: user.displayName, username: user.username, photoURL: user.photoURL ?? null });
});

export default r;
