import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.use(requireAuth);

r.get('/me', async (req: any, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ error: 'NotFound' });
  return res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  });
});

r.patch('/me', async (req: any, res) => {
  const { username, displayName } = req.body || {};
  const update: any = {};
  if (typeof username === 'string') update.username = username.trim().toLowerCase();
  if (typeof displayName === 'string') update.displayName = displayName.trim();
  if (!Object.keys(update).length) return res.status(400).json({ error: 'InvalidInput' });

  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();
    if (!user) return res.status(404).json({ error: 'NotFound' });
    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });
  } catch (e: any) {
    if (e?.code === 11000 && e?.keyPattern?.username) {
      return res.status(409).json({ error: 'UsernameTaken' });
    }
    return res.status(500).json({ error: 'InternalServerError' });
  }
});

export default r;
