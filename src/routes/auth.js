// backend/src/routes/auth.js
const express = require('express');
const { register, verifyEmail, login, refreshToken, logout, resendVerification } = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimiter');
const { validateRegister, validateLogin } = require('../middlewares/validators');

const router = express.Router();

// Public auth routes with strict rate limiting
router.post('/register', authLimiter, validateRegister, register);
router.get('/verify-email', verifyEmail);
router.post('/login', authLimiter, validateLogin, login);
router.post('/resend-verification', authLimiter, resendVerification);
router.get('/refresh-token', refreshToken);
router.post('/logout', logout);

module.exports = router;
