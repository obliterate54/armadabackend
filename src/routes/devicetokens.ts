import { Router } from 'express';
import { z } from 'zod';
import { DeviceToken } from '../models/DeviceToken.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.post('/devices/register', requireAuth, async (req, res) => {
  const uid = (req as any).uid as string;
  const body = z.object({ token: z.string(), platform: z.string().optional() }).parse(req.body);
  await DeviceToken.findOneAndUpdate(
    { token: body.token },
    { $set: { uid, platform: body.platform, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

export default r;
