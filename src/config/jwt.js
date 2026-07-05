// backend/src/config/jwt.js
module.exports = {
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: '15m', // 15 minutes
  refreshExpiresIn: '7d', // 7 days
};
