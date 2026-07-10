// backend/src/controllers/userController.js
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { getCache, setCache, clearCache } = require('../utils/redis');
const cloudinaryHelper = require('../helpers/cloudinaryHelper');

const { geocodeAddress } = require('../utils/geocoder');

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

const formatUserResponse = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  return {
    ...obj,
    avatar: obj.avatarUrl || obj.avatar || DEFAULT_AVATAR,
  };
};

// @desc   Get current user profile
// @route  GET /api/users/me
// @access Private (protect middleware)
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: formatUserResponse(user) });
  } catch (error) {
    logger.error('Get profile error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Update current user profile (name, avatar, address, credentials)
// @route  PUT /api/users/me
// @access Private
const updateProfile = async (req, res) => {
  const body = req.body || {};
  const name = body.name;
  const avatar = body.avatar;
  const country = body.country;
  const addressLine = body.addressLine;
  const city = body.city;
  const state = body.state;
  const pincode = body.pincode;
  const institutionName = body.institutionName;
  const educationLevel = body.educationLevel;
  const academicDetails = body.academicDetails;

  let coordinates = body.coordinates;
  if (typeof coordinates === 'string' && coordinates.trim()) {
    try {
      coordinates = JSON.parse(coordinates);
    } catch {
      coordinates = undefined;
    }
  }

  try {
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (country !== undefined) updateFields.country = country;
    if (addressLine !== undefined) updateFields.addressLine = addressLine;
    if (city !== undefined) updateFields.city = city;
    if (state !== undefined) updateFields.state = state;
    if (pincode !== undefined) updateFields.pincode = pincode;
    if (institutionName !== undefined) updateFields.institutionName = institutionName;
    if (educationLevel !== undefined) updateFields.educationLevel = educationLevel;
    if (academicDetails !== undefined) updateFields.academicDetails = academicDetails;

    // Check if address was updated to compute coordinates
    const isAddressUpdated = 
      addressLine !== undefined || 
      city !== undefined || 
      state !== undefined || 
      pincode !== undefined ||
      country !== undefined;

    if (coordinates !== undefined) {
      updateFields.coordinates = coordinates;
    } else if (isAddressUpdated) {
      const currentUser = await User.findById(req.user.id);
      const queryAddressLine = addressLine !== undefined ? addressLine : (currentUser?.addressLine || '');
      const queryCity = city !== undefined ? city : (currentUser?.city || '');
      const queryState = state !== undefined ? state : (currentUser?.state || '');
      const queryPincode = pincode !== undefined ? pincode : (currentUser?.pincode || '');
      const queryCountry = country !== undefined ? country : (currentUser?.country || '');

      const coords = await geocodeAddress(queryAddressLine, queryCity, queryState, queryPincode, queryCountry);
      updateFields.coordinates = coords;
    }

    // If an avatar image is provided (multipart file or base64), upload/store it
    if (req.file) {
      const imageUrl = await cloudinaryHelper.uploadFromBuffer(
        req.file.buffer,
        req.file.mimetype || 'image/jpeg'
      );
      updateFields.avatarUrl = imageUrl;
    } else if (avatar && avatar.startsWith('data:image')) {
      const imageUrl = await cloudinaryHelper.uploadImage(avatar);
      updateFields.avatarUrl = imageUrl;
    } else if (avatar && !avatar.startsWith('data:image')) {
      updateFields.avatarUrl = avatar;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateFields, { new: true, runValidators: true }).select('-password');
    // Invalidate profile cache
    await clearCache(`user:profile:${req.user.id}`);
    await clearCache('listings:*');
    res.json({ success: true, user: formatUserResponse(user) });
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

const registerPushSubscription = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object.' });
    }

    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
      user.pushSubscriptions.push(subscription);
      await user.save();
      logger.info(`[Web Push] Registered new subscription for user ${user.email}`);
    }

    res.json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    logger.error('Register push subscription error:', error.message);
    res.status(500).json({ success: false, message: 'Server error registering subscription' });
  }
};

const removePushSubscription = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint is required.' });
    }

    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { pushSubscriptions: { endpoint } }
    });
    logger.info(`[Web Push] Removed subscription for user ${req.user.id}`);

    res.json({ success: true, message: 'Push subscription removed successfully.' });
  } catch (error) {
    logger.error('Remove push subscription error:', error.message);
    res.status(500).json({ success: false, message: 'Server error removing subscription' });
  }
};

const getVapidKey = (req, res) => {
  const { getVapidPublicKey } = require('../utils/pushNotification');
  const key = getVapidPublicKey();
  res.json({ success: true, publicKey: key });
};

module.exports = { getProfile, updateProfile, getUserDetails, registerPushSubscription, removePushSubscription, getVapidKey };
