import jwt from 'jsonwebtoken';
import type { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { User } from '../models/User.js';
import type { TokenPayload } from '../types/auth.js';

// Helper: grab the exact allowed type for expiresIn
type JwtExpires = NonNullable<SignOptions['expiresIn']>;

export interface AuthResult {
  user: {
    id: string;
    email: string;
    username: string;
    avatarUrl?: string;
    bio?: string;
    settings: any;
    stats: any;
  };
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  private accessSecret: Secret;
  private refreshSecret: Secret;
  private accessExpiry: JwtExpires;
  private refreshExpiry: JwtExpires;

  constructor() {
    this.accessSecret = process.env.JWT_ACCESS_SECRET || 'dev_access';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev_refresh';
    this.accessExpiry = (process.env.JWT_ACCESS_EXPIRES_IN as JwtExpires) ?? '15m';
    this.refreshExpiry = (process.env.JWT_REFRESH_EXPIRES_IN as JwtExpires) ?? '7d';

    if (this.accessSecret === 'dev_access' || this.refreshSecret === 'dev_refresh') {
      console.warn('⚠️  Using fallback JWT secrets! Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production.');
    }
  }

  async register(email: string, username: string, password: string): Promise<AuthResult> {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        throw new Error('Email already registered');
      }
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await User.hashPassword(password);

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      passwordHash
    });

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      type: 'access'
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken
    };
  }

  async login(emailOrUsername: string, password: string): Promise<AuthResult> {
    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername.toLowerCase() }
      ],
      deletedAt: null
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last seen
    await user.updateLastSeen();

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      type: 'access'
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = jwt.verify(refreshToken, this.refreshSecret) as TokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Verify user still exists and is active
      const user = await User.findById(payload.userId).select('email username');
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      return this.generateTokens({
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
        type: 'access'
      });
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.accessSecret) as TokenPayload;
      
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await User.hashPassword(newPassword);
    user.passwordHash = newPasswordHash;
    await user.save();
  }

  async resetPassword(email: string): Promise<void> {
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not
      return;
    }

    // TODO: Implement email sending for password reset
    // For now, just log the reset request
    console.log(`Password reset requested for: ${email}`);
  }

  private generateTokens(payload: TokenPayload): { accessToken: string; refreshToken: string } {
    const accessPayload: TokenPayload = { ...payload, type: 'access' };
    const refreshPayload: TokenPayload = { ...payload, type: 'refresh' };

    const accessOpts: SignOptions = { expiresIn: this.accessExpiry };
    const refreshOpts: SignOptions = { expiresIn: this.refreshExpiry };

    const accessToken = jwt.sign(accessPayload as JwtPayload, this.accessSecret, accessOpts);
    const refreshToken = jwt.sign(refreshPayload as JwtPayload, this.refreshSecret, refreshOpts);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any): AuthResult['user'] {
    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      settings: user.settings,
      stats: user.stats
    };
  }

  // Utility method to extract user ID from token (for middleware)
  async getUserIdFromToken(token: string): Promise<string> {
    const payload = await this.verifyAccessToken(token);
    return payload.userId;
  }
}

export const authService = new AuthService();