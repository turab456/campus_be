// backend/src/routes/userRoutes.js
const express = require('express');
const { getProfile, updateProfile } = require('../controllers/userController');
const protect = require('../middlewares/auth');

const router = express.Router();

// Protected user routes
router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);

module.exports = router;
