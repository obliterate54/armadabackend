import type { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = await admin.auth().verifyIdToken(token);
    (req as any).uid = decoded.uid;
    (req as any).auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
