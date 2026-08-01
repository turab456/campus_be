// backend/src/routes/auth.js
const express = require('express');
const { register, verifyEmail, login, googleLogin, refreshToken, logout, resendVerification, forgotPassword, resetPassword } = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimiter');
const { validateRegister, validateLogin, validateGoogleLogin } = require('../middlewares/validators');

const router = express.Router();

// Public auth routes with strict rate limiting
router.post('/register', authLimiter, validateRegister, register);
router.get('/verify-email', verifyEmail);
router.post('/login', authLimiter, validateLogin, login);
router.post('/google', authLimiter, validateGoogleLogin, googleLogin);
router.post('/resend-verification', authLimiter, resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/refresh-token', refreshToken);
router.post('/logout', logout);

module.exports = router;
