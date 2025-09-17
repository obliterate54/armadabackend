import { Router } from 'express';
import { z } from 'zod';
import { Thread } from '../models/Thread.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/threads', requireAuth, async (req, res) => {
  const after = req.query.after ? new Date(String(req.query.after)) : undefined;
  const q: any = {};
  if (after) q.createdAt = { $lt: after };
  const list = await Thread.find(q).sort({ createdAt: -1 }).limit(50);
  res.json(list);
});

r.post('/threads', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({ text: z.string().min(1).max(1000) }).parse(req.body);
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
