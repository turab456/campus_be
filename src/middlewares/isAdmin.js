// backend/src/middlewares/isAdmin.js

/**
 * Middleware to restrict access to admin-only routes.
 * Must be used after the `protect` middleware so that req.user is populated.
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
  }
  next();
};

module.exports = isAdmin;
