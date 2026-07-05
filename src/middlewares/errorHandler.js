// backend/src/middlewares/errorHandler.js
const { logger } = require('../utils/logger');

// 404 handler
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// General error handler
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);

  // In production, never expose internal error details or stack traces
  const isProduction = process.env.NODE_ENV === 'production';

  const response = {
    success: false,
    message: isProduction && statusCode === 500 ? 'Internal Server Error' : err.message,
  };

  // Only include validation errors in non-production or for 4xx responses
  if (!isProduction || statusCode < 500) {
    if (err.errors) {
      response.errors = err.errors;
    }
  }

  // Only include stack trace in development
  if (!isProduction) {
    response.stack = err.stack;
  }

  logger.error(err);
  res.json(response);
};

module.exports = { notFoundHandler, errorHandler };
