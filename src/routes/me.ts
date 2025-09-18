import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/me', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  let me = await User.findOne({ uid });
  if (!me) {
    const decoded: any = (req as any).auth || {};
    me = await User.create({
      uid,
      email: decoded.email,
      displayName: decoded.name,
      photoURL: decoded.picture,
    });
  }
  res.json(me);
});

r.post('/me', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({
    displayName: z.string().min(1).max(50).optional(),
    username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/i).optional(),
    photoURL: z.string().url().optional(),
  }).parse(req.body);

  if (body.username) {
    const clash = await User.findOne({ username: new RegExp(`^${body.username}$`, 'i'), uid: { $ne: uid } });
    if (clash) return res.status(409).json({ error: 'UsernameTaken' });
  }

  const $set: any = {};
  if (typeof body.displayName !== 'undefined') $set.displayName = body.displayName;
  if (typeof body.username !== 'undefined') $set.username = body.username;
  if (typeof body.photoURL !== 'undefined') $set.photoURL = body.photoURL;

  const me = await User.findOneAndUpdate({ uid }, { $set }, { upsert: true, new: true });
  res.json(me);
});

export default r;
