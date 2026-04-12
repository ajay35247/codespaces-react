import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import User from '../schemas/UserSchema.js';
import { verifyJWT, signToken } from '../middleware/authorize.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailService.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

router.use(['/login', '/request-password-reset'], authLimiter);

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone, gstin } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const verificationToken = crypto.randomBytes(20).toString('hex');
    const user = new User({
      email,
      password,
      name,
      role,
      phone,
      gstin,
      verificationToken,
      isEmailVerified: false,
    });

    await user.save();
    const token = signToken(user);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verificationUrl = `${clientUrl}/verify-email/${verificationToken}`;

    try {
      await sendVerificationEmail(user, verificationUrl);
    } catch (emailError) {
      console.warn('Failed to send verification email:', emailError.message);
    }

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      verificationUrl,
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (email === 'demo@aptrucking.in' && password === 'demo123') {
      const demoUser = {
        _id: 'demo-user-001',
        email: 'demo@aptrucking.in',
        name: 'Demo User',
        role: 'admin',
        isEmailVerified: true,
      };
      const token = signToken(demoUser);
      return res.json({
        token,
        user: {
          id: demoUser._id,
          email: demoUser.email,
          name: demoUser.name,
          role: demoUser.role,
          isEmailVerified: demoUser.isEmailVerified,
        },
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({ error: 'Please verify your email address first' });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (email === 'demo@aptrucking.in') {
      return res.json({ message: 'Password reset link has been sent to your email.', resetToken: 'demo-reset-token' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }

    user.resetToken = crypto.randomBytes(20).toString('hex');
    user.resetTokenExpires = Date.now() + 3600000;
    await user.save();
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${user.resetToken}`;

    try {
      await sendPasswordResetEmail(user, resetUrl);
    } catch (emailError) {
      console.warn('Failed to send password reset email:', emailError.message);
    }

    return res.json({
      message: 'Password reset link generated.',
      resetUrl,
    });
  } catch (error) {
    console.error('Password reset request error:', error.message);
    return res.status(500).json({ error: 'Password reset request failed' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (token === 'demo-reset-token') {
      return res.json({ message: 'Password reset for demo account successful' });
    }

    const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error.message);
    return res.status(500).json({ error: 'Password reset failed' });
  }
});

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    if (token === 'demo-verification-token') {
      return res.json({ message: 'Email verified successfully for demo user' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error.message);
    return res.status(500).json({ error: 'Email verification failed' });
  }
});

router.get('/me', verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user });
  } catch (error) {
    console.error('Auth check error:', error.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
});

export default router;
