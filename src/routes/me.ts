import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/me', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  let me = await User.findOne({ uid });
  if (!me) me = await User.create({ uid });
  res.json(me);
});

r.post('/me', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({
    displayName: z.string().min(1).max(50),
    username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/i).optional(),
    photoURL: z.string().url().optional(),
  }).parse(req.body);

  if (body.username) {
    const clash = await User.findOne({ username: body.username, uid: { $ne: uid } });
    if (clash) return res.status(409).json({ error: 'UsernameTaken' });
  }

  const me = await User.findOneAndUpdate({ uid }, { $set: body }, { upsert: true, new: true });
  res.json(me);
});

export default r;
