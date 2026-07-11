// backend/src/routes/violations.js
const express = require('express');
const {
  reportUnwantedMessage,
  markListingAsSold,
  confirmReceipt,
  cancelPendingSale,
  getUserViolations,
  checkIfBlocked,
  reportUnconfirmedSaleAdmin,
  blockUserAdmin,
  unblockUserAdmin,
  resetScoresAdmin
} = require('../controllers/violationController');

const protect = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');
const checkBlocked = require('../middlewares/checkBlocked');
const { reportLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Public routes
router.get('/check-blocked/:userId', checkIfBlocked);

// Protected routes (all require authentication and block check)
router.use(protect);
router.use(checkBlocked);

// User routes
router.post('/report-message', reportLimiter, reportUnwantedMessage);
router.post('/mark-sold/:listingId', markListingAsSold);
router.post('/confirm-receipt/:listingId', confirmReceipt);
router.post('/cancel-sale/:listingId', cancelPendingSale);
router.get('/warnings/:userId', getUserViolations);

// Admin routes
router.use(isAdmin);
router.post('/report-unconfirmed-sale', reportUnconfirmedSaleAdmin);
router.post('/block-user', blockUserAdmin);
router.post('/unblock-user', unblockUserAdmin);
router.post('/reset-scores', resetScoresAdmin);

module.exports = router;
