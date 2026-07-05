// backend/src/routes/wishlist.js
const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const protect = require('../middlewares/auth');

const checkBlocked = require('../middlewares/checkBlocked');

router.get('/', protect, wishlistController.getWishlist);
router.post('/toggle', protect, checkBlocked, wishlistController.toggleWishlist);

module.exports = router;
