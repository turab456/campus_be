// backend/src/controllers/userController.js
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { getCache, setCache, clearCache } = require('../utils/redis');
const cloudinaryHelper = require('../helpers/cloudinaryHelper');

// @desc   Get current user profile
// @route  GET /api/users/me
// @access Private (protect middleware)
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Get profile error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Update current user profile (name, avatar)
// @route  PUT /api/users/me
// @access Private
const updateProfile = async (req, res) => {
  const { name } = req.body;
  try {
    const updateFields = {};
    if (name) updateFields.name = name;
    // If an avatar image is provided (base64 or multipart), upload to Cloudinary
    if (req.file) {
      const imageUrl = await cloudinaryHelper.uploadFromBuffer(req.file.buffer);
      updateFields.avatarUrl = imageUrl;
    }
    const user = await User.findByIdAndUpdate(req.user.id, updateFields, { new: true, runValidators: true }).select('-password');
    // Invalidate profile cache
    await clearCache(`user:profile:${req.user.id}`);
    await clearCache('listings:*');
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Update profile error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const cacheKey = `user:profile:${req.params.id}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      logger.info(`[Cache Hit] Serving user profile details for: ${req.params.id}`);
      return res.json(cachedData);
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if ((user.blocked || user.flagged) && req.user.id !== user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'This student account is suspended or under review.' });
    }
    
    // Fetch listings for this user
    const Listing = require('../models/Listing');
    const listings = await Listing.find({ seller: user._id })
      .populate('seller', 'name avatarUrl')
      .populate('category', 'name');
      
    // Fetch reviews for this user
    const Review = require('../models/Review');
    const reviews = await Review.find({ seller: user._id })
      .populate('reviewer', 'name avatarUrl')
      .sort({ createdAt: -1 });

    const mappedReviews = reviews.map(r => ({
      id: r._id.toString(),
      reviewerName: r.reviewer ? r.reviewer.name : 'Student',
      reviewerAvatar: r.reviewer && r.reviewer.avatarUrl ? r.reviewer.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString()
    }));
      
    const responseData = {
      success: true,
      user: {
        ...user.toObject(),
        avatar: user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        rating: user.rating || 5.0,
        reviewsCount: user.reviewsCount || 0,
        joinedDate: user.createdAt,
      },
      listings,
      reviews: mappedReviews,
    };

    // Cache user profile for 10 minutes (600 seconds)
    await setCache(cacheKey, responseData, 600);
    res.json(responseData);
  } catch (error) {
    logger.error('Get user details error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const registerFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, message: 'FCM token is required.' });
    }

    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { fcmTokens: token.trim() }
    });

    res.json({ success: true, message: 'FCM token registered successfully.' });
  } catch (error) {
    logger.error('Register FCM token error:', error.message);
    res.status(500).json({ success: false, message: 'Server error registering token' });
  }
};

const removeFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, message: 'FCM token is required.' });
    }

    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { fcmTokens: token.trim() }
    });

    res.json({ success: true, message: 'FCM token removed successfully.' });
  } catch (error) {
    logger.error('Remove FCM token error:', error.message);
    res.status(500).json({ success: false, message: 'Server error removing token' });
  }
};

module.exports = { getProfile, updateProfile, getUserDetails, registerFcmToken, removeFcmToken };
