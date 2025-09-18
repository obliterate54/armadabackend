import { Router } from 'express';
import { z } from 'zod';
import { FriendRequest } from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';

const r = Router();

r.get('/friends/requests', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const mine = await FriendRequest.find({ $or: [{ from: uid }, { to: uid }] })
    .sort({ createdAt: -1 }).limit(100);
  res.json(mine);
});

r.post('/friends/request', requireAuth, async (req, res) => {
  const from = (req as any).uid as string;
  const body = z.object({ to: z.string().min(1) }).parse(req.body);

  // Resolve recipient: direct uid match or username (case-insensitive)
  let toUid = body.to.trim();
  if (!/^[-_A-Za-z0-9]{6,}$/.test(toUid)) {
    const target = await User.findOne({ username: new RegExp(`^${toUid}$`, 'i') });
    if (!target) return res.status(404).json({ error: 'UserNotFound' });
    toUid = target.uid;
  } else {
    const asUid = await User.findOne({ uid: toUid });
    if (!asUid) {
      // If not a known uid, try as username
      const target = await User.findOne({ username: new RegExp(`^${toUid}$`, 'i') });
      if (!target) return res.status(404).json({ error: 'UserNotFound' });
      toUid = target.uid;
    }
  }

  if (toUid === from) return res.status(400).json({ error: 'CannotFriendSelf' });

  try {
    const fr = await FriendRequest.create({ from, to: toUid, status: 'pending' });
    res.status(201).json(fr);
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ error: 'AlreadyRequested' });
    throw e;
  }
});

r.post('/friends/respond', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({ id: z.string(), action: z.enum(['accept','decline']) }).parse(req.body);
  const fr = await FriendRequest.findById(body.id);
  if (!fr || fr.to !== uid) return res.status(404).json({ error: 'NotFound' });
  fr.status = body.action === 'accept' ? 'accepted' : 'declined';
  await fr.save();
  res.json(fr);
});

export default r;
