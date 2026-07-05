// backend/src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { accessSecret } = require('../config/jwt');

/**
 * Middleware to protect routes. Expects JWT in Authorization header as `Bearer <token>`.
 */
const protect = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, accessSecret);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (error) {
    logger.error('Auth middleware error', error);
    res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

module.exports = protect;
