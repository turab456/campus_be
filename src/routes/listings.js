// backend/src/routes/listings.js
const express = require('express');
const {
  createListing,
  getListing,
  updateListing,
  deleteListing,
  searchListings,
} = require('../controllers/listingController');
const protect = require('../middlewares/auth');
const checkBlocked = require('../middlewares/checkBlocked');
const { uploadListingImages } = require('../middlewares/upload');
const { validateCreateListing, validateSearch } = require('../middlewares/validators');
const { moderateListingMiddleware } = require('../middlewares/contentModeration');

const router = express.Router();

// Public endpoints
router.get('/search', validateSearch, searchListings);
router.get('/:id', getListing);

// Protected – creation and owner actions (with secure file upload + content moderation + block check)
router.post('/', protect, checkBlocked, uploadListingImages, validateCreateListing, moderateListingMiddleware, createListing);
router.put('/:id', protect, checkBlocked, uploadListingImages, moderateListingMiddleware, updateListing);
router.delete('/:id', protect, checkBlocked, deleteListing);

module.exports = router;
