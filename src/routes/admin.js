// backend/src/routes/admin.js
const express = require('express');
const {
  getDashboard,
  getAllUsers,
  getUserDetails,
  deleteUser,
  flagUser,
  unflagUser,
  blockUser,
  unblockUser,
  getAllListings,
  getListingDetails,
  approveListing,
  rejectListing,
  deleteListing,
  flagListing,
  getFraudReports,
  createFraudReport,
  getSpamReports,
  deleteMessage,
  reportSpam,
  getUserStats,
  getListingStats,
  getSpamStats
} = require('../controllers/adminController');

const protect = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

// Apply auth and admin middleware to all routes
router.use(protect);
router.use(isAdmin);

// Dashboard
router.get('/dashboard', getDashboard);

// User Management
router.get('/users', getAllUsers);
router.get('/users/:userId', getUserDetails);
router.delete('/users/:userId', deleteUser);
router.post('/users/:userId/flag', flagUser);
router.post('/users/:userId/unflag', unflagUser);
router.post('/users/:userId/block', blockUser);
router.post('/users/:userId/unblock', unblockUser);

// Listing Management
router.get('/listings', getAllListings);
router.get('/listings/:listingId', getListingDetails);
router.post('/listings/:listingId/approve', approveListing);
router.post('/listings/:listingId/reject', rejectListing);
router.delete('/listings/:listingId', deleteListing);
router.post('/listings/:listingId/flag', flagListing);

// Fraud Reports
router.get('/fraud-reports', getFraudReports);
router.post('/fraud-reports', createFraudReport);

// Spam & Messages
router.get('/spam-reports', getSpamReports);
router.get('/messages/:messageId', async (req, res) => {
  const mongoose = require('mongoose');
  const Message = require('../models/Message');
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.messageId)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    const message = await Message.findById(req.params.messageId).populate('sender', 'name email');
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching message' });
  }
});
router.delete('/messages/:messageId', deleteMessage);
router.post('/spam-reports', reportSpam);

// Statistics
router.get('/statistics/users', getUserStats);
router.get('/statistics/listings', getListingStats);
router.get('/statistics/spam', getSpamStats);

// Reconsideration Appeals
const reconsiderationController = require('../controllers/reconsiderationController');
router.get('/reconsideration-tickets', reconsiderationController.getAdminTickets);
router.post('/reconsideration-tickets/:ticketId/resolve', reconsiderationController.resolveTicket);

module.exports = router;
