// backend/src/middlewares/validators.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware that checks for validation errors and returns 400 if any.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// ---- Auth Validators ----

const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .escape(),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('college').optional().trim().isLength({ max: 200 }).escape(),
  body('department').optional().trim().isLength({ max: 200 }).escape(),
  body('semester').optional().isInt({ min: 1, max: 12 }).withMessage('Semester must be 1-12'),
  handleValidationErrors
];

const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

// ---- Listing Validators ----

const validateCreateListing = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('price')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 0, max: 999999 }).withMessage('Price must be 0-999999'),
  body('condition')
    .optional()
    .isIn(['New', 'Like New', 'Very Good', 'Good', 'Acceptable']).withMessage('Invalid condition value'),
  body('author').optional().trim().isLength({ max: 200 }),
  body('originalPrice').optional().isFloat({ min: 0, max: 999999 }),
  body('department').optional().trim().isLength({ max: 200 }),
  body('semester').optional().isInt({ min: 1, max: 12 }),
  body('pickupLocation').optional().trim().isLength({ max: 300 }),
  body('college').optional().trim().isLength({ max: 200 }),
  handleValidationErrors
];

// ---- Message Validators ----

const validateSendMessage = [
  body('chatId')
    .trim()
    .notEmpty().withMessage('chatId is required')
    .isMongoId().withMessage('Invalid chatId format'),
  body('text')
    .trim()
    .notEmpty().withMessage('Message text is required')
    .isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
  handleValidationErrors
];

// ---- Review Validators ----

const validateAddReview = [
  param('sellerId')
    .notEmpty().withMessage('Seller ID is required')
    .isMongoId().withMessage('Invalid seller ID format'),
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer between 1 and 5'),
  body('comment')
    .trim()
    .notEmpty().withMessage('Comment is required')
    .isLength({ min: 1, max: 500 }).withMessage('Comment must be 1-500 characters'),
  handleValidationErrors
];

// ---- Chat Validators ----

const validateCreateChat = [
  body('bookId')
    .trim()
    .notEmpty().withMessage('bookId is required')
    .isMongoId().withMessage('Invalid bookId format'),
  handleValidationErrors
];

// ---- Search Validators ----

const validateSearch = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50').toInt(),
  query('search').optional().trim().isLength({ max: 200 }).withMessage('Search query too long'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateListing,
  validateSendMessage,
  validateAddReview,
  validateCreateChat,
  validateSearch,
  handleValidationErrors
};
