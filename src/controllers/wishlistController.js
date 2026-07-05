// backend/src/controllers/wishlistController.js
const User = require('../models/User');

// Get all wishlist item IDs for current user
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const wishlistIds = (user.wishlist || []).map(id => id.toString());
    res.json({ success: true, wishlist: wishlistIds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle wishlist item (add or remove)
exports.toggleWishlist = async (req, res) => {
  try {
    const { bookId } = req.body;
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'bookId is required' });
    }
    const Listing = require('../models/Listing');
    const listing = await Listing.findById(bookId);
    if (listing && listing.seller.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot add your own listing to your wishlist' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.wishlist) {
      user.wishlist = [];
    }

    const stringWishlist = user.wishlist.map(id => id.toString());
    const idx = stringWishlist.indexOf(bookId);
    let isSaved = false;

    if (idx > -1) {
      user.wishlist.splice(idx, 1);
    } else {
      user.wishlist.push(bookId);
      isSaved = true;
    }

    await user.save();
    res.json({ success: true, isSaved, wishlist: user.wishlist.map(id => id.toString()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
