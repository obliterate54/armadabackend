import { Router } from 'express';
import { z } from 'zod';
import { FriendRequest } from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';

const r = Router();

r.get('/friends/requests', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const mine = await FriendRequest.find({ $or: [{ from: userId }, { to: userId }] })
    .sort({ createdAt: -1 }).limit(100);
  res.json({ items: mine });
});

r.post('/friends/request', requireAuth, async (req, res) => {
  const from = (req as any).userId as string;
  const body = z.object({ to: z.string().min(1) }).parse(req.body);

  // Resolve recipient: direct userId match or username (case-insensitive)
  let toUserId = body.to.trim();
  if (!/^[a-f0-9]{24}$/.test(toUserId)) {
    const target = await User.findOne({ username: new RegExp(`^${toUserId}$`, 'i') });
    if (!target) return res.status(404).json({ error: 'UserNotFound' });
    toUserId = target._id.toString();
  } else {
    const asUserId = await User.findById(toUserId);
    if (!asUserId) {
      // If not a known userId, try as username
      const target = await User.findOne({ username: new RegExp(`^${toUserId}$`, 'i') });
      if (!target) return res.status(404).json({ error: 'UserNotFound' });
      toUserId = target._id.toString();
    }
  }

  if (toUserId === from) return res.status(400).json({ error: 'CannotFriendSelf' });

  try {
    const fr = await FriendRequest.create({ from, to: toUserId, status: 'pending' });
    res.status(201).json(fr);
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ error: 'AlreadyRequested' });
    throw e;
  }
});

r.post('/friends/respond', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const body = z.object({ id: z.string(), action: z.enum(['accept','decline']) }).parse(req.body);
  const fr = await FriendRequest.findById(body.id);
  if (!fr || fr.to !== userId) return res.status(404).json({ error: 'NotFound' });
  fr.status = body.action === 'accept' ? 'accepted' : 'declined';
  await fr.save();
  res.json(fr);
});

export default r;
