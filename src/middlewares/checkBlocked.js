// backend/src/middlewares/checkBlocked.js
const User = require('../models/User');
const { logger } = require('../utils/logger');

/**
 * Middleware to check if user is blocked
 * If blocked, prevent them from performing any actions except viewing their own profile
 */
const checkBlocked = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.blocked) {
      logger.warn(`Blocked user attempted action: ${user.email} - ${req.method} ${req.originalUrl}`);
      
      return res.status(403).json({
        success: false,
        blocked: true,
        message: 'Your account has been suspended due to policy violations',
        blockReason: user.blockReason,
        blockedAt: user.blockedAt,
        supportEmail: 'support@campus-marketplace.edu'
      });
    }

    // Attach user data to request
    req.userDetails = user;
    next();

  } catch (error) {
    logger.error('Error in checkBlocked middleware:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = checkBlocked;
