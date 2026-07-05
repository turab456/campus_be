// backend/src/controllers/reviewController.js
const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const Listing = require('../models/Listing');

// Create review for a seller
exports.addReview = async (req, res) => {
  try {
    const reviewerId = req.user.id;
    const sellerId = req.params.sellerId;
    const { rating, comment } = req.body;

    // Input is already validated by validators middleware, but do server-side safety checks
    if (reviewerId === sellerId) {
      return res.status(400).json({ success: false, message: 'You cannot review yourself' });
    }

    // Validate sellerId format
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: 'Invalid seller ID' });
    }

    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Verify that the reviewer has completed a purchase/trade with the seller
    const completedTrade = await Listing.findOne({
      seller: sellerId,
      buyer: reviewerId,
      isSold: true,
      buyerConfirmedReceipt: true
    });
    if (!completedTrade) {
      return res.status(403).json({
        success: false,
        message: 'You can only review a seller after successfully completing a purchase/transaction with them.'
      });
    }

    // Prevent duplicate reviews: one review per reviewer per seller
    const existingReview = await Review.findOne({ seller: sellerId, reviewer: reviewerId });
    if (existingReview) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this seller. You can only submit one review per seller.' });
    }

    // Clamp rating to integer between 1-5
    const clampedRating = Math.min(5, Math.max(1, Math.round(Number(rating))));

    // Create review
    const review = new Review({
      seller: sellerId,
      reviewer: reviewerId,
      rating: clampedRating,
      comment: comment.substring(0, 500) // Enforce max length server-side
    });
    await review.save();

    // Recalculate average rating and count for the seller
    const reviews = await Review.find({ seller: sellerId });
    const count = reviews.length;
    const sum = reviews.reduce((total, r) => total + r.rating, 0);
    const avgRating = count > 0 ? Number((sum / count).toFixed(1)) : 5.0;

    seller.rating = avgRating;
    seller.reviewsCount = count;
    await seller.save();

    // Populate reviewer info to return
    const populatedReview = await Review.findById(review._id).populate('reviewer', 'name avatarUrl');

    const mappedReview = {
      id: populatedReview._id.toString(),
      reviewerName: populatedReview.reviewer ? populatedReview.reviewer.name : 'Student',
      reviewerAvatar: populatedReview.reviewer && populatedReview.reviewer.avatarUrl ? populatedReview.reviewer.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      rating: populatedReview.rating,
      comment: populatedReview.comment,
      createdAt: populatedReview.createdAt.toISOString()
    };

    // Emit real-time notification to the seller
    const { emitToUser } = require('../utils/socket');
    emitToUser(sellerId, 'notification', {
      type: 'review',
      title: 'New Review Received',
      body: `${req.user.name || 'A user'} rated you ${clampedRating} stars: "${comment.substring(0, 40)}${comment.length > 40 ? '...' : ''}"`
    });

    res.status(201).json({ success: true, review: mappedReview, sellerRating: avgRating, sellerReviewsCount: count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
