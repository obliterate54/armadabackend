import { Router } from 'express';
import { z } from 'zod';
import { Thread } from '../models/Thread.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/threads', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const { limit = '20', cursor } = req.query as any;
  const parsedLimit = Math.max(1, Math.min(100, Number(limit)));

  // Build list of author ids: me + accepted friends
  const accepted = await FriendRequest.find({
    status: 'accepted',
    $or: [{ from: uid }, { to: uid }],
  }).lean();
  const friendUids = new Set<string>();
  for (const fr of accepted) {
    if (fr.from !== uid) friendUids.add(fr.from as any);
    if (fr.to !== uid) friendUids.add(fr.to as any);
  }
  const authors = [uid, ...Array.from(friendUids)];
  const q: any = { authorId: { $in: authors } };

  if (cursor) {
    const before = new Date(String(cursor));
    if (!isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }
  }

  const list = await Thread.find(q).sort({ createdAt: -1 }).limit(parsedLimit + 1).lean();
  const hasMore = list.length > parsedLimit;
  const items = hasMore ? list.slice(0, parsedLimit) : list;
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;
  res.json({ items, nextCursor });
});

r.post('/threads', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({ text: z.string().min(1).max(500) }).parse(req.body);
  const doc = await Thread.create({ authorId: uid, text: body.text });
  res.status(201).json(doc);
});

r.delete('/threads/:id', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const t = await Thread.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'NotFound' });
  if (t.authorId !== uid) return res.status(403).json({ error: 'Forbidden' });
  await t.deleteOne();
  res.json({ ok: true });
});

export default r;
