// backend/src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { queueJob } = require('../utils/jobQueue');
const { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn } = require('../config/jwt');
const { logger } = require('../utils/logger');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Helper to generate tokens
const generateToken = (payload, secret, expiresIn) => {
  return jwt.sign(payload, secret, { expiresIn });
};

// @desc   Register new user
// @route  POST /api/auth/register
// @access Public
const register = async (req, res) => {
  const { name, email, password, college, department, semester } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    const user = await User.create({ name, email, password, college, department, semester });
    // Send verification email (simple token link)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verifyToken}&id=${user._id}`;
    // Store token temporarily (could be a DB field; using env for brevity)
    user.verificationToken = verifyToken;
    await user.save();
    try {
      await queueJob('EMAIL', {
        from: `Campus Marketplace <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Verify your email',
        html: `<p>Hello ${user.name},</p><p>Please verify your email by clicking <a href="${verificationUrl}">here</a>.</p>`,
      });
    } catch (queueError) {
      logger.error(`Failed to queue verification email. Error: ${queueError.stack || queueError.message}`);
    }
    res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (error) {
    logger.error('Register error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Verify email
// @route  GET /api/auth/verify-email
// @access Public
const verifyEmail = async (req, res) => {
  const { token, id } = req.query;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    if (user.isVerified) {
      return res.json({ success: true, message: 'Email already verified. You can now log in.' });
    }
    if (user.verificationToken !== token) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();
    res.json({ success: true, message: 'Email verified. You can now log in.' });
  } catch (error) {
    logger.error('Verify email error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Login user
// @route  POST /api/auth/login
// @access Public
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify email is confirmed before allowing login (admins bypassed for prototype ease)
    if (user.role !== 'admin' && !user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.'
      });
    }

    // Safety: check if user is blocked or flagged (admin bypass allowed)
    if (user.role !== 'admin') {
      if (user.blocked) {
        return res.status(403).json({
          success: false,
          blocked: true,
          message: 'Your account is blocked due to suspicious activity. Please raise a ticket for reconsideration in the profile section.',
          blockReason: user.blockReason
        });
      }
      if (user.flagged) {
        return res.status(403).json({
          success: false,
          flagged: true,
          message: 'Your account is temporarily flagged for review due to suspicious activity. Please contact support.',
          flagReason: user.flagReason
        });
      }
    }

    const accessToken = generateToken({ id: user._id, role: user.role }, accessSecret, accessExpiresIn);
    const refreshToken = generateToken({ id: user._id }, refreshSecret, refreshExpiresIn);
    // Optionally set httpOnly cookie
    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true, accessToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, college: user.college, department: user.department, semester: user.semester } });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Refresh JWT
// @route  GET /api/auth/refresh-token
// @access Public (uses refresh cookie)
const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'No refresh token' });
  }
  try {
    const decoded = jwt.verify(token, refreshSecret);
    const accessToken = generateToken({ id: decoded.id }, accessSecret, accessExpiresIn);
    res.json({ success: true, accessToken });
  } catch (err) {
    logger.error('Refresh token error', err);
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
};

// @desc   Logout user (clear cookie)
// @route  POST /api/auth/logout
// @access Private
const logout = (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out' });
};

module.exports = { register, verifyEmail, login, refreshToken, logout };
