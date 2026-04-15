import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, role, name, phone } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email or phone.' });
    }

    const user = new User({ email, password, role, name, phone });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          name: user.name,
          phone: user.phone,
          isVerified: user.isVerified
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.isLocked) {
      return res.status(423).json({ error: 'Account is locked due to too many failed login attempts.' });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      await user.incLoginAttempts();
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          name: user.name,
          phone: user.phone,
          isVerified: user.isVerified
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone } = req.body;
    const user = req.user;

    if (phone && phone !== user.phone) {
      const existingUser = await User.findOne({ phone, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ error: 'Phone number already in use.' });
      }
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};