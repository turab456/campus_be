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
const { getFromAddress } = require('../config/mail');
const { OAuth2Client } = require('google-auth-library');
const { attachVisitorToUser, recordMarketingEvent } = require('./marketingController');

// Helper to generate tokens
const generateToken = (payload, secret, expiresIn) => {
  return jwt.sign(payload, secret, { expiresIn });
};

// @desc   Register new user
// @route  POST /api/auth/register
// @access Public
const register = async (req, res) => {
  const { name, email, password } = req.body;
  const visitorId = req.body.visitorId || req.cookies?.revoshelf_visitor_id;
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    const user = await User.create({ name, email, password });
    await recordMarketingEvent({
      visitorId,
      userId: user._id,
      eventType: 'signup_started',
      payload: req.body,
      req
    });
    // Send verification email (simple token link)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verifyToken}&id=${user._id}`;
    // Store token temporarily (could be a DB field; using env for brevity)
    user.verificationToken = verifyToken;
    user.verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    // Log verification link to console to allow local testing and bypass SMTP port blocks on Render
    logger.info(`[Email Verification Link]: ${verificationUrl}`);
    console.log(`\n✉️ [Email Verification Link]: ${verificationUrl}\n`);

    try {
      await queueJob('EMAIL', {
        from: getFromAddress('noreply'),
        to: user.email,
        subject: 'Verify your email',
        templateName: 'verify-email',
        context: {
          name: user.name,
          verificationUrl,
          subject: 'Verify your email'
        }
      });
    } catch (queueError) {
      logger.error(`Failed to queue verification email. Error: ${queueError.stack || queueError.message}`);
    }

    await attachVisitorToUser({ userId: user._id, visitorId });
    await recordMarketingEvent({
      visitorId,
      userId: user._id,
      eventType: 'registration_completed',
      payload: req.body,
      req
    });

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
    // Check token expiry
    if (user.verificationTokenExpiresAt && new Date() > user.verificationTokenExpiresAt) {
      return res.status(400).json({ success: false, message: 'Verification link has expired. Please request a new one.' });
    }
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiresAt = undefined;
    await user.save();
    await recordMarketingEvent({
      visitorId: user.marketing?.visitorId || req.query.visitorId,
      userId: user._id,
      eventType: 'email_verified',
      payload: req.query,
      req
    });
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
    if (!user.password) {
      return res.status(401).json({ success: false, message: 'This account uses Google Sign-In. Please log in with Google.' });
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
    // Optionally set httpOnly cookie with maxAge to persist across browser/PWA closures
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    res.json({ success: true, accessToken, user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      institutionName: user.institutionName,
      educationLevel: user.educationLevel,
      academicDetails: user.academicDetails,
      avatarUrl: user.avatarUrl,
      addressLine: user.addressLine,
      city: user.city,
      state: user.state,
      pincode: user.pincode,
      country: user.country,
      coordinates: user.coordinates,
    } });
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
    const user = await User.findById(decoded.id).select('role').lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const accessToken = generateToken({ id: decoded.id, role: user.role }, accessSecret, accessExpiresIn);
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

// @desc   Resend email verification link
// @route  POST /api/auth/resend-verification
// @access Public
const resendVerification = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    // Always return a generic message to prevent user enumeration
    const user = await User.findOne({ email });
    if (!user || user.isVerified) {
      // Return 200 even if user doesn't exist or is already verified
      return res.json({ success: true, message: 'If this email is registered and unverified, a verification link has been sent.' });
    }
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verifyToken}&id=${user._id}`;
    user.verificationToken = verifyToken;
    user.verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    // Log verification link to console to allow local testing and bypass SMTP port blocks on Render
    logger.info(`[Resend Email Verification Link]: ${verificationUrl}`);
    console.log(`\n✉️ [Resend Email Verification Link]: ${verificationUrl}\n`);

    try {
      await queueJob('EMAIL', {
        from: getFromAddress('noreply'),
        to: user.email,
        subject: 'Verify your email',
        templateName: 'verify-email',
        context: {
          name: user.name,
          verificationUrl,
          subject: 'Verify your email'
        }
      });
    } catch (queueError) {
      logger.error(`Failed to queue verification email. Error: ${queueError.stack || queueError.message}`);
    }
    res.json({ success: true, message: 'If this email is registered and unverified, a verification link has been sent.' });
  } catch (error) {
    logger.error('Resend verification link error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Forgot password
// @route  POST /api/auth/forgot-password
// @access Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account with this email address exists.' });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, message: 'This account uses Google Sign-In. Please sign in with Google.' });
    }

    // Generate reset token and expires time (1 hour)
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    logger.info(`[Password Reset Link]: ${resetUrl}`);
    console.log(`\n✉️ [Password Reset Link]: ${resetUrl}\n`);

    try {
      await queueJob('EMAIL', {
        from: getFromAddress('noreply'),
        to: user.email,
        subject: 'Reset your password',
        templateName: 'reset-password',
        context: {
          name: user.name,
          resetUrl,
          subject: 'Reset your password'
        }
      });
    } catch (queueError) {
      logger.error(`Failed to queue reset password email. Error: ${queueError.stack || queueError.message}`);
    }

    res.json({ success: true, message: 'Password recovery email sent successfully.' });
  } catch (error) {
    logger.error('Forgot password error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Reset password
// @route  POST /api/auth/reset-password
// @access Public
const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  try {
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiresAt: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Password reset token is invalid or has expired.' });
    }

    // Update password (pre-save hook will hash it automatically)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (error) {
    logger.error('Reset password error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Google Sign-In
// @route  POST /api/auth/google
// @access Public
const googleLogin = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Google ID Token is required' });
  }

  try {
    let payload;

    // Support mock verification in development/testing mode for ease of local validation
    if (process.env.NODE_ENV !== 'production' && idToken.startsWith('mock-google-token-')) {
      const mockEmail = idToken.replace('mock-google-token-', '');
      payload = {
        sub: `google-mock-id-${mockEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
        email: mockEmail,
        name: mockEmail.split('@')[0],
        picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        email_verified: true
      };
    } else {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ success: false, message: 'Google Client ID is not configured on the backend.' });
      }
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, message: 'Invalid Google token payload.' });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture;

    // Check Case 1: User already exists with the same email
    let user = await User.findOne({ email });

    if (user) {
      // Link Google to this account if not already stored
      if (!user.googleId) {
        user.googleId = googleId;
      }
      // If user signed up with password, they might have provider = 'local'.
      // Update/link if needed, but do not overwrite local credentials
      if (!user.provider) {
        user.provider = 'local'; // default
      }
      await user.save();
    } else {
      // Check Case 3: Create a new user
      user = await User.create({
        name,
        email,
        googleId,
        provider: 'google',
        avatarUrl,
        isVerified: true // Google emails are already pre-verified by Google
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
    
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institutionName: user.institutionName,
        educationLevel: user.educationLevel,
        academicDetails: user.academicDetails,
        avatarUrl: user.avatarUrl,
        addressLine: user.addressLine,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
        country: user.country,
        coordinates: user.coordinates,
      }
    });
  } catch (error) {
    logger.error('Google login error', error);
    res.status(401).json({ success: false, message: 'Google authentication failed or token is invalid.' });
  }
};

module.exports = { 
  register, 
  verifyEmail, 
  login, 
  googleLogin,
  refreshToken, 
  logout, 
  resendVerification,
  forgotPassword,
  resetPassword
};
