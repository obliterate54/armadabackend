import { Router } from 'express';
import { User } from '../models/User.js';

const r = Router();

r.get('/users/check-username/:username', async (req, res) => {
  const raw = String(req.params.username || '').trim().toLowerCase();
  // same rules client uses
  if (!/^[a-z0-9_.]{3,20}$/.test(raw)) {
    return res.status(400).json({ error: 'InvalidUsername' });
  }
  const exists = await User.exists({ username: raw });
  return res.json({ available: !exists });
});

export default r;
