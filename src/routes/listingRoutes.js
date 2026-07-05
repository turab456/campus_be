// backend/src/routes/listingRoutes.js
const express = require('express');
const {
  createListing,
  getListing,
  updateListing,
  deleteListing,
  searchListings,
} = require('../controllers/listingController');
const protect = require('../middlewares/auth');

const router = express.Router();

// Public endpoints
router.get('/search', searchListings); // /api/listings/search?....
router.get('/:id', getListing);

// Protected – creation and owner actions
router.post('/', protect, createListing);
router.put('/:id', protect, updateListing);
router.delete('/:id', protect, deleteListing);

module.exports = router;
