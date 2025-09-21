import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { User } from '../models/User.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
  userId?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    
    if (!token) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_TOKEN', 
          message: 'Authorization token required' 
        } 
      });
    }

    const payload = await authService.verifyAccessToken(token);
    
    // Optionally fetch user details (can be cached for performance)
    const user = await User.findById(payload.userId).select('email username avatarUrl');
    if (!user) {
      return res.status(401).json({ 
        error: { 
          code: 'USER_NOT_FOUND', 
          message: 'User not found' 
        } 
      });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      username: user.username
    };
    req.userId = user._id.toString();
    
    next();
  } catch (error) {
    res.status(401).json({ 
      error: { 
        code: 'INVALID_TOKEN', 
        message: 'Invalid or expired token' 
      } 
    });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    
    if (!token) {
      return next(); // Continue without authentication
    }

    const payload = await authService.verifyAccessToken(token);
    const user = await User.findById(payload.userId).select('email username avatarUrl');
    
    if (user) {
      req.user = {
        id: user._id.toString(),
        email: user.email,
        username: user.username
      };
      req.userId = user._id.toString();
    }
    
    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
}
