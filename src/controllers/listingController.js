// backend/src/controllers/listingController.js
const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { getCache, setCache, clearCache } = require('../utils/redis');
const cloudinaryHelper = require('../helpers/cloudinaryHelper');
const jwt = require('jsonwebtoken');
const { accessSecret } = require('../config/jwt');
const { getDistanceInKm } = require('../utils/geocoder');

/**
 * Escape special regex characters from user input to prevent ReDoS / NoSQL injection.
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// @desc   Create a new listing
// @route  POST /api/listings
// @access Private
const createListing = async (req, res) => {
  const {
    title,
    description,
    price,
    condition,
    categoryId,
    category: categoryValue,
    author,
    originalPrice,
    department,
    semester,
    pickupLocation,
    college,
    isFeatured,
    isPopular,
    metadata
  } = req.body;

  try {
    // Resolve category
    let categoryDoc = null;
    const identifier = categoryId || categoryValue;
    if (identifier) {
      if (mongoose.Types.ObjectId.isValid(identifier)) {
        categoryDoc = await Category.findById(identifier);
      }
      if (!categoryDoc) {
        // Fallback: search by name case-insensitively — escape input to prevent injection
        const cleanName = escapeRegex(identifier.replace(/-/g, ' '));
        categoryDoc = await Category.findOne({
          name: { $regex: new RegExp('^' + cleanName + '$', 'i') }
        });
      }
    }

    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    // Handle images if any
    let imageUrls = req.body.images || [];
    if (req.files && req.files.length) {
      const uploadPromises = req.files.map(file => cloudinaryHelper.uploadFromBuffer(file.buffer));
      const uploadedUrls = await Promise.all(uploadPromises);
      imageUrls = [...imageUrls, ...uploadedUrls];
    }

    // Validate image domains to prevent SSRF/XSS vectors
    const allowedDomains = [
      'https://res.cloudinary.com/',
      'https://images.unsplash.com/'
    ];
    for (const url of imageUrls) {
      const isAllowed = allowedDomains.some(domain => url.startsWith(domain));
      if (!isAllowed) {
        return res.status(400).json({ success: false, message: 'Invalid listing image URL source. Images must be hosted on Cloudinary or Unsplash.' });
      }
    }

    const listing = await Listing.create({
      title,
      description,
      price,
      condition,
      category: categoryDoc._id,
      seller: req.user.id,
      images: imageUrls,
      author,
      originalPrice,
      department,
      semester,
      pickupLocation,
      college,
      isFeatured: isFeatured || false,
      isPopular: isPopular || false,
      metadata: metadata || {}
    });
    // Invalidate listings caches
    await clearCache('listings:*');
    res.status(201).json({ success: true, listing });
  } catch (error) {
    logger.error('Create listing error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get listing by ID (public)
// @route  GET /api/listings/:id
// @access Public
const getListing = async (req, res) => {
  try {
    // Validate that the ID is a valid ObjectId to prevent casting errors
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'name avatarUrl spamScore scamScore flagged blocked coordinates')
      .populate('category', 'name');
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Exclude if seller is blocked or flagged
    if (listing.seller && (listing.seller.blocked || listing.seller.flagged)) {
      return res.status(404).json({ success: false, message: 'Listing not found or seller account is suspended' });
    }

    // Optional auth check for viewer coordinates
    let userCoords = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, accessSecret);
        const reqUser = await User.findById(decoded.id).select('coordinates');
        if (reqUser && reqUser.coordinates) {
          userCoords = reqUser.coordinates;
        }
      } catch (err) {
        // ignore token error
      }
    }

    const listingObj = listing.toObject();
    if (userCoords && listing.seller && listing.seller.coordinates) {
      const dist = getDistanceInKm(userCoords.lat, userCoords.lng, listing.seller.coordinates.lat, listing.seller.coordinates.lng);
      listingObj.distanceKm = parseFloat(dist.toFixed(1));
      listingObj.isNearMe = dist <= 5;
    }

    res.json({ success: true, listing: listingObj });
  } catch (error) {
    logger.error('Get listing error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Update own listing
// @route  PUT /api/listings/:id
// @access Private (owner only)
const updateListing = async (req, res) => {
  const {
    title,
    description,
    price,
    condition,
    categoryId,
    category: categoryValue,
    author,
    originalPrice,
    department,
    semester,
    pickupLocation,
    college,
    isFeatured,
    isPopular,
    isSold,
    status,
    metadata
  } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    if (listing.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const identifier = categoryId || categoryValue;
    if (identifier) {
      let categoryDoc = null;
      if (mongoose.Types.ObjectId.isValid(identifier)) {
        categoryDoc = await Category.findById(identifier);
      }
      if (!categoryDoc) {
        const cleanName = escapeRegex(identifier.replace(/-/g, ' '));
        categoryDoc = await Category.findOne({
          name: { $regex: new RegExp('^' + cleanName + '$', 'i') }
        });
      }
      if (!categoryDoc) return res.status(400).json({ success: false, message: 'Invalid category' });
      listing.category = categoryDoc._id;
    }

    if (title) listing.title = title;
    if (description) listing.description = description;
    if (price) listing.price = price;
    if (condition) listing.condition = condition;
    if (author) listing.author = author;
    if (originalPrice) listing.originalPrice = originalPrice;
    if (department) listing.department = department;
    if (semester) listing.semester = semester;
    if (pickupLocation) listing.pickupLocation = pickupLocation;
    if (college) listing.college = college;
    if (isFeatured !== undefined) listing.isFeatured = isFeatured;
    if (isPopular !== undefined) listing.isPopular = isPopular;
    if (isSold !== undefined) listing.isSold = isSold;
    if (status !== undefined) listing.isSold = (status === 'sold');

    // Handle new images
    if (req.files && req.files.length) {
      const newUrls = await Promise.all(req.files.map(file => cloudinaryHelper.uploadFromBuffer(file.buffer)));
      listing.images.push(...newUrls);
    }
    if (req.body.images) {
      listing.images = req.body.images;
    }

    // Validate image domains to prevent SSRF/XSS vectors
    const allowedDomains = [
      'https://res.cloudinary.com/',
      'https://images.unsplash.com/'
    ];
    for (const url of listing.images) {
      const isAllowed = allowedDomains.some(domain => url.startsWith(domain));
      if (!isAllowed) {
        return res.status(400).json({ success: false, message: 'Invalid listing image URL source. Images must be hosted on Cloudinary or Unsplash.' });
      }
    }

    if (metadata !== undefined) listing.metadata = metadata;

    await listing.save();
    // Invalidate listings caches
    await clearCache('listings:*');
    res.json({ success: true, listing });
  } catch (error) {
    logger.error('Update listing error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Delete own listing
// @route  DELETE /api/listings/:id
// @access Private (owner only)
const deleteListing = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    if (listing.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await Listing.deleteOne({ _id: listing._id });
    // Invalidate listings caches
    await clearCache('listings:*');
    res.json({ success: true, message: 'Listing removed' });
  } catch (error) {
    logger.error('Delete listing error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Search listings (public)
// @route  GET /api/listings/search?search=..&category=..&condition=..&minPrice=..&maxPrice=..&sort=..
// @access Public
const searchListings = async (req, res) => {
  // Clamp page and limit to safe bounds
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { search, category, condition, minPrice, maxPrice, sort } = req.query;

  const filter = { isSold: false, flagged: { $ne: true } }; // Only show listings that haven't been sold and aren't flagged



  // Full-text search on title and description
  if (search) {
    const escapedSearch = escapeRegex(search);
    filter.$or = [
      { title: { $regex: escapedSearch, $options: 'i' } },
      { description: { $regex: escapedSearch, $options: 'i' } }
    ];
  }

  // Category filter
  if (category) {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    } else {
      const cleanName = category.replace(/-/g, ' ');
      const categoryDoc = await Category.findOne({
        name: cleanName
      }).collation({ locale: 'en', strength: 2 });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      } else {
        return res.json({ success: true, listings: [], total: 0, page, pages: 0 });
      }
    }
  }

  // Condition filter (comma-separated values e.g. "New,Like New")
  if (condition) {
    const conditions = condition.split(',').map(c => c.trim()).filter(Boolean);
    if (conditions.length > 0) {
      filter.condition = { $in: conditions };
    }
  }

  // Price range filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  // Sort options
  let sortOption = { createdAt: -1 }; // default: most recent
  if (sort === 'price_asc') sortOption = { price: 1 };
  else if (sort === 'price_desc') sortOption = { price: -1 };
  else if (sort === 'oldest') sortOption = { createdAt: 1 };

  let userCoords = null;
  let userId = 'public';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, accessSecret);
      userId = decoded.id;
      const reqUser = await User.findById(decoded.id).select('coordinates');
      if (reqUser && reqUser.coordinates) {
        userCoords = reqUser.coordinates;
      }
    } catch (err) {
      // ignore token error
    }
  }

  try {
    const cacheKey = `listings:search:${userId}:${JSON.stringify(req.query)}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      logger.info(`[Cache Hit] Serving search listings for key: ${cacheKey}`);
      return res.json(cachedData);
    }

    // Exclude listings from flagged or blocked users
    const restrictedUsers = await User.find({
      $or: [{ blocked: true }, { flagged: true }]
    }).select('_id');
    const restrictedUserIds = restrictedUsers.map(u => u._id);
    filter.seller = { $nin: restrictedUserIds };

    if (req.query.nearMe === 'true' && userCoords) {
      const allSellers = await User.find({}).select('coordinates');
      const nearSellerIds = allSellers
        .filter(s => {
          if (!s.coordinates || s.coordinates.lat === undefined || s.coordinates.lng === undefined) return false;
          const dist = getDistanceInKm(userCoords.lat, userCoords.lng, s.coordinates.lat, s.coordinates.lng);
          return dist <= 10; // within 10 km
        })
        .map(s => s._id);

      filter.seller = { $in: nearSellerIds, $nin: restrictedUserIds };
    }

    console.log('[Search Debug] Filter:', JSON.stringify(filter));
    const listings = await Listing.find(filter)
      .populate('seller', 'name avatarUrl spamScore scamScore coordinates')
      .populate('category', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(sortOption);
    console.log('[Search Debug] Found:', listings.length, 'listings');
    const total = await Listing.countDocuments(filter);

    const populatedListings = listings.map(l => {
      const lObj = l.toObject();
      if (userCoords && l.seller && l.seller.coordinates) {
        const dist = getDistanceInKm(userCoords.lat, userCoords.lng, l.seller.coordinates.lat, l.seller.coordinates.lng);
        lObj.distanceKm = parseFloat(dist.toFixed(1));
        lObj.isNearMe = dist <= 5;
      }
      return lObj;
    });

    const responseData = { success: true, listings: populatedListings, total, page, pages: Math.ceil(total / limit) };
    // Cache search results for 5 minutes (300 seconds)
    await setCache(cacheKey, responseData, 300);
    res.json(responseData);
  } catch (error) {
    logger.error('Search listings error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createListing, getListing, updateListing, deleteListing, searchListings };
