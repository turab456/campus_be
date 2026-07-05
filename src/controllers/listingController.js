// backend/src/controllers/listingController.js
const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const { logger } = require('../utils/logger');
const cloudinaryHelper = require('../helpers/cloudinaryHelper');
const jwt = require('jsonwebtoken');
const { accessSecret } = require('../config/jwt');

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
      .populate('seller', 'name avatarUrl spamScore scamScore')
      .populate('category', 'name');
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    res.json({ success: true, listing });
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
    res.json({ success: true, message: 'Listing removed' });
  } catch (error) {
    logger.error('Delete listing error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Search listings (public)
// @route  GET /api/listings?search=...&category=...&page=1&limit=10
// @access Public
const searchListings = async (req, res) => {
  // Clamp page and limit to safe bounds
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const { search, category } = req.query;

  const filter = {};

  // Exclude current user's listings if authenticated
  let currentUserId = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, accessSecret);
      currentUserId = decoded.id;
    } catch (e) {
      // Ignore invalid/expired tokens for public search
    }
  } else if (req.cookies && req.cookies.token) {
    try {
      const decoded = jwt.verify(req.cookies.token, accessSecret);
      currentUserId = decoded.id;
    } catch (e) {
      // Ignore
    }
  }

  if (currentUserId) {
    filter.seller = { $ne: currentUserId };
  }

  if (search) {
    // Escape user input to prevent ReDoS attacks
    const escapedSearch = escapeRegex(search);
    filter.$or = [
      { title: { $regex: escapedSearch, $options: 'i' } },
      { description: { $regex: escapedSearch, $options: 'i' } }
    ];
  }
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
        // Category slug doesn't exist, return empty results
        return res.json({ success: true, listings: [], total: 0, page, pages: 0 });
      }
    }
  }
  try {
    const listings = await Listing.find(filter)
      .populate('seller', 'name avatarUrl spamScore scamScore')
      .populate('category', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    const total = await Listing.countDocuments(filter);
    res.json({ success: true, listings, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Search listings error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createListing, getListing, updateListing, deleteListing, searchListings };
