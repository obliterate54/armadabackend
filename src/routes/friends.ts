import { Router } from 'express';
import { z } from 'zod';
import { FriendRequest } from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';

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
  if (body.to === from) return res.status(400).json({ error: 'CannotFriendSelf' });
  try {
    const fr = await FriendRequest.create({ from, to: body.to, status: 'pending' });
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
