// backend/src/routes/authRoutes.js
const express = require('express');
const { register, verifyEmail, login, refreshToken, logout, resendVerification } = require('../controllers/authController');

const router = express.Router();

// Public auth routes
router.post('/register', register);
router.get('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/resend-verification', resendVerification);
router.get('/refresh-token', refreshToken);
router.post('/logout', logout); // will be protected via cookie, but no auth needed for logout clear

module.exports = router;
