// backend/src/routes/notificationRoutes.js
const express = require('express');
const { getPublicKey, subscribe, unsubscribe } = require('../controllers/notificationController');
const protect = require('../middlewares/auth');

const router = express.Router();

router.get('/public-key', getPublicKey);
router.post('/subscribe', protect, subscribe);
router.post('/unsubscribe', protect, unsubscribe);

module.exports = router;
