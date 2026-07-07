// backend/src/routes/users.js
const express = require('express');
const { getProfile, updateProfile, getUserDetails, registerPushSubscription, removePushSubscription, getVapidKey } = require('../controllers/userController');
const reviewController = require('../controllers/reviewController');
const protect = require('../middlewares/auth');
const { uploadAvatar } = require('../middlewares/upload');
const { validateAddReview } = require('../middlewares/validators');

const reconsiderationController = require('../controllers/reconsiderationController');

const checkBlocked = require('../middlewares/checkBlocked');

const router = express.Router();

router.get('/me', protect, getProfile);
router.put('/me', protect, uploadAvatar, updateProfile);
router.post('/reconsideration-tickets', protect, reconsiderationController.createTicket);
router.get('/reconsideration-tickets/my-status', protect, reconsiderationController.getMyStatus);
router.get('/vapid-public-key', protect, getVapidKey);
router.get('/:id', protect, getUserDetails);
router.post('/push-subscription', protect, registerPushSubscription);
router.post('/push-subscription/remove', protect, removePushSubscription);
router.post('/:sellerId/reviews', protect, checkBlocked, validateAddReview, reviewController.addReview);

module.exports = router;
