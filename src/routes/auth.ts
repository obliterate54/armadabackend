import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signJwt } from '../utils/jwt.js';

const r = Router();

// Register endpoint
r.post('/auth/register', async (req, res) => {
  try {
    const { email, password, username } = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      username: z.string().min(3).max(32).optional(),
    }).parse(req.body);

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        ...(username ? [{ username: new RegExp(`^${username}$`, 'i') }] : [])
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({ error: 'EmailAlreadyExists' });
      }
      if (username && existingUser.username?.toLowerCase() === username.toLowerCase()) {
        return res.status(409).json({ error: 'UsernameTaken' });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate username if not provided
    let finalUsername = username;
    if (!finalUsername) {
      const local = email.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || '';
      finalUsername = local || `user_${Date.now().toString(36)}`;
      
      // Ensure username is unique
      let counter = 0;
      while (await User.findOne({ username: new RegExp(`^${finalUsername}$`, 'i') })) {
        finalUsername = `${local || 'user'}${counter}`;
        counter++;
      }
    }

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      passwordHash,
      username: finalUsername,
      displayName: finalUsername,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await user.save();

    // Generate JWT token
    const token = signJwt({
      userId: user._id.toString(),
      email: user.email,
    });

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'InvalidInput', details: error.issues });
    }
    res.status(500).json({ error: 'InternalServerError' });
  }
});

// Login endpoint
r.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'InvalidCredentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'InvalidCredentials' });
    }

    // Generate JWT token
    const token = signJwt({
      userId: user._id.toString(),
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'InvalidInput', details: error.issues });
    }
    res.status(500).json({ error: 'InternalServerError' });
  }
});

// Get current user endpoint
r.get('/auth/me', async (req, res) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'UserNotFound' });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'InternalServerError' });
  }
});

export default r;
