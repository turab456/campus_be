// backend/src/routes/support.js
const express = require('express');
const { submitContactForm, submitSupportTicket } = require('../controllers/supportController');
const protect = require('../middlewares/auth');

const router = express.Router();

// Public route for contact form
router.post('/contact-us', submitContactForm);

// Protected route for reporting issues (requires logged in user for email/name mapping)
router.post('/report-issue', protect, submitSupportTicket);

module.exports = router;
