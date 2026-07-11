// backend/src/middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Global rate limiter: max 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict auth rate limiter: max 5 attempts per 15 minutes per IP
// Prevents brute-force login and registration spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Message sending rate limiter: max 30 messages per minute per IP
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { success: false, message: 'You are sending messages too fast. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Report/violation rate limiter: max 10 reports per hour per IP
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many reports submitted. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, authLimiter, messageLimiter, reportLimiter };

