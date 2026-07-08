// backend/src/controllers/violationController.js
const User = require('../models/User');
const Listing = require('../models/Listing');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const FraudReport = require('../models/FraudReport');
const {
  increaseUserScore,
  reportUnwantedMessage,
  reportUnconfirmedSale,
  getUserWarnings,
  isUserBlocked,
  blockUser,
  unblockUser,
  resetUserScores
} = require('../utils/scoreManager');
const { logger } = require('../utils/logger');
const { createNotification } = require('./notificationController');

// @desc   Report unwanted/spam message
// @route  POST /api/violations/report-message
// @access Private
exports.reportUnwantedMessage = async (req, res) => {
  try {
    const { messageId, reason } = req.body;
    const reportedBy = req.user.id;

    if (!messageId || !reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message ID and reason are required' 
      });
    }

    // Get message details
    const message = await Message.findById(messageId).populate('sender');
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Prevent self-reporting
    if (message.sender._id.toString() === reportedBy) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot report your own messages' 
      });
    }

    // Report the violation
    const result = await reportUnwantedMessage(
      message.sender._id,
      messageId,
      reason
    );

    // Flag the message
    await Message.findByIdAndUpdate(messageId, {
      flagged: true,
      flagReason: `Reported by ${req.user.id}: ${reason}`,
      spamScore: Math.min((message.spamScore || 0) + 15, 100)
    });

    // Log the report
    logger.info(`Message reported: ${messageId} by ${reportedBy}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Message reported successfully',
      data: {
        senderStatus: result,
        messageId,
        reportedBy
      }
    });

  } catch (error) {
    logger.error('Report message error:', error.message);
    res.status(500).json({ success: false, message: 'Error reporting message' });
  }
};

// @desc   Mark listing as sold (seller)
// @route  POST /api/violations/mark-sold/:listingId
// @access Private
exports.markListingAsSold = async (req, res) => {
  try {
    const { listingId } = req.params;
    const { buyerId } = req.body;
    const sellerId = req.user.id;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Verify seller
    if (listing.seller.toString() !== sellerId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the seller can mark this listing as sold' 
      });
    }

    let targetBuyerId = buyerId;

    if (!targetBuyerId) {
      // Get or create chat for this listing to identify the buyer
      const chat = await Chat.findOne({
        book: listingId
      }).populate('buyer');

      if (!chat) {
        return res.status(400).json({ 
          success: false, 
          message: 'No active chat inquiries found. Please specify a buyer.' 
        });
      }
      targetBuyerId = chat.buyer._id;
    }

    if (targetBuyerId.toString() === sellerId) {
      return res.status(400).json({ success: false, message: 'You cannot mark an item as sold to yourself.' });
    }

    listing.isSold = false; // Remains unsold until buyer confirms
    listing.salePending = true;
    listing.soldAt = new Date();
    listing.buyer = targetBuyerId;

    await listing.save();

    logger.info(`Listing marked as pending sale: ${listingId} by seller ${sellerId} to buyer ${targetBuyerId}`);

    const chatDoc = await Chat.findOne({ book: listing._id, buyer: targetBuyerId });
    const relatedChatId = chatDoc ? chatDoc._id : undefined;

    // Notify buyer to confirm receipt
    await createNotification({
      recipient: targetBuyerId,
      type: 'sale_pending',
      title: 'Confirm Your Purchase',
      message: `The seller has marked "${listing.title}" as sold to you. Please confirm that you received the item.`,
      relatedListing: listing._id,
      relatedChat: relatedChatId,
      relatedUser: sellerId,
    });

    res.json({
      success: true,
      message: 'Listing marked as pending sale. Waiting for buyer confirmation...',
      data: {
        listing,
        buyerId: targetBuyerId,
        requiresConfirmation: true
      }
    });

  } catch (error) {
    logger.error('Mark sold error:', error.message);
    res.status(500).json({ success: false, message: 'Error marking listing as sold' });
  }
};

// @desc   Confirm receipt of purchased item (buyer)
// @route  POST /api/violations/confirm-receipt/:listingId
// @access Private
exports.confirmReceipt = async (req, res) => {
  try {
    const { listingId } = req.params;
    const buyerId = req.user.id;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Verify this user is the buyer
    if (!listing.buyer || listing.buyer.toString() !== buyerId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the buyer can confirm receipt of this listing' 
      });
    }

    if (!listing.salePending) {
      return res.status(400).json({ 
        success: false, 
        message: 'This listing does not have a pending sale' 
      });
    }

    // Confirm receipt and finalize transaction
    listing.isSold = true;
    listing.salePending = false;
    listing.buyerConfirmedReceipt = true;
    listing.confirmedAt = new Date();

    await listing.save();

    const chatDoc = await Chat.findOne({ book: listing._id, buyer: buyerId });
    const relatedChatId = chatDoc ? chatDoc._id : undefined;

    // Notify seller that buyer confirmed
    await createNotification({
      recipient: listing.seller,
      type: 'sale_confirmed',
      title: 'Sale Confirmed! 🎉',
      message: `The buyer has confirmed receiving "${listing.title}". Your transaction is now complete.`,
      relatedListing: listing._id,
      relatedChat: relatedChatId,
      relatedUser: buyerId,
    });

    res.json({
      success: true,
      message: 'Receipt confirmed successfully. Transaction completed.',
      data: {
        listing,
        confirmedAt: listing.confirmedAt
      }
    });

  } catch (error) {
    logger.error('Confirm receipt error:', error.message);
    res.status(500).json({ success: false, message: 'Error confirming receipt' });
  }
};

// @desc   Cancel a pending sale (seller or buyer)
// @route  POST /api/violations/cancel-sale/:listingId
// @access Private
exports.cancelPendingSale = async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.id;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Check authorization
    const isSeller = listing.seller.toString() === userId;
    const isBuyer = listing.buyer && listing.buyer.toString() === userId;

    if (!isSeller && !isBuyer) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this pending sale'
      });
    }

    if (!listing.salePending) {
      return res.status(400).json({
        success: false,
        message: 'No pending sale exists for this listing'
      });
    }

    // Reset listing fields back to active
    listing.salePending = false;
    listing.isSold = false;
    listing.buyer = undefined;
    listing.buyerConfirmedReceipt = false;
    listing.soldAt = undefined;
    listing.confirmedAt = undefined;

    await listing.save();

    logger.info(`Pending sale canceled for listing: ${listingId} by user: ${userId}`);

    // If the buyer is the one canceling/denying the sale, increase seller's scam score
    // AND increase the listing's fraud score
    if (isBuyer) {
      const reason = `Buyer denied purchase and canceled pending sale for book: "${listing.title}"`;
      await increaseUserScore(listing.seller, 'scamScore', 20, reason);

      // Increase the listing's own fraud score
      listing.fraudScore = Math.min(100, (listing.fraudScore || 0) + 25);
      await listing.save();

      const seller = await User.findById(listing.seller);
      if (seller) {
        // Fraud report for the seller (user-level)
        await FraudReport.create({
          itemId: listing.seller,
          itemType: 'user',
          reason: `Buyer denied receiving item for listing "${listing.title}". Seller: ${seller.name} (${seller.email}).`,
          score: seller.scamScore
        });

        // Fraud report for the listing itself (listing-level)
        await FraudReport.create({
          itemId: listing._id,
          itemType: 'listing',
          reason: `Buyer denied receiving this item. Listing: "${listing.title}" by ${seller.name} (${seller.email}). Listing fraud score increased to ${listing.fraudScore}/100.`,
          score: listing.fraudScore
        });

        const chatDoc = await Chat.findOne({ book: listing._id, buyer: userId });
        const relatedChatId = chatDoc ? chatDoc._id : undefined;

        // Notify seller that buyer denied receipt
        await createNotification({
          recipient: listing.seller,
          type: 'sale_denied',
          title: '⚠️ Buyer Denied Your Sale',
          message: `The buyer has denied receiving "${listing.title}". Your scam score has been increased. The listing is back to active.`,
          relatedListing: listing._id,
          relatedChat: relatedChatId,
          relatedUser: userId,
        });

        // Notify seller about fraud warning
        await createNotification({
          recipient: listing.seller,
          type: 'fraud_warning',
          title: '🚨 Fraud Warning on Your Account',
          message: `Your account has been flagged due to a buyer denial on "${listing.title}". Repeated violations may result in account suspension.`,
          relatedListing: listing._id,
          relatedChat: relatedChatId,
        });
      }

      const chatDoc = await Chat.findOne({ book: listing._id, buyer: userId });
      const relatedChatId = chatDoc ? chatDoc._id : undefined;

      // Notify buyer that the denial was processed
      await createNotification({
        recipient: userId,
        type: 'sale_denied',
        title: 'Sale Denial Processed',
        message: `Your denial for "${listing.title}" has been processed. The seller has been reported and the listing is back to active.`,
        relatedListing: listing._id,
        relatedChat: relatedChatId,
      });
    } else {
      // Seller canceled — notify buyer
      if (listing.buyer) {
        const chatDoc = await Chat.findOne({ book: listing._id, buyer: listing.buyer });
        const relatedChatId = chatDoc ? chatDoc._id : undefined;

        await createNotification({
          recipient: listing.buyer,
          type: 'sale_canceled',
          title: 'Sale Canceled by Seller',
          message: `The seller has canceled the pending sale for "${listing.title}". The listing is now available again.`,
          relatedListing: listing._id,
          relatedChat: relatedChatId,
        });
      }
    }

    res.json({
      success: true,
      message: 'Pending sale canceled. Listing is active again.',
      listing
    });
  } catch (error) {
    logger.error('Cancel pending sale error:', error.message);
    res.status(500).json({ success: false, message: 'Error canceling pending sale' });
  }
};

// @desc   Get user violations and warnings
// @route  GET /api/violations/warnings/:userId
// @access Private
exports.getUserViolations = async (req, res) => {
  try {
    const { userId } = req.params;

    const warnings = await getUserWarnings(userId);
    const blockStatus = await isUserBlocked(userId);

    res.json({
      success: true,
      data: {
        warnings: warnings.warnings,
        spamScore: warnings.spamScore,
        scamScore: warnings.scamScore,
        violationCount: warnings.violationCount,
        blocked: blockStatus.blocked,
        blockReason: blockStatus.blockReason,
        blockedAt: blockStatus.blockedAt
      }
    });

  } catch (error) {
    logger.error('Get violations error:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching violations' });
  }
};

// @desc   Check if user is blocked
// @route  GET /api/violations/check-blocked/:userId
// @access Public
exports.checkIfBlocked = async (req, res) => {
  try {
    const { userId } = req.params;

    const blockStatus = await isUserBlocked(userId);

    res.json({
      success: true,
      data: blockStatus
    });

  } catch (error) {
    logger.error('Check blocked error:', error.message);
    res.status(500).json({ success: false, message: 'Error checking user status' });
  }
};

// @desc   Report unconfirmed sale (admin only)
// @route  POST /api/violations/report-unconfirmed-sale
// @access Private (Admin)
exports.reportUnconfirmedSaleAdmin = async (req, res) => {
  try {
    const { listingId, sellerId, reason } = req.body;

    if (!listingId || !sellerId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Listing ID and seller ID are required' 
      });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const result = await reportUnconfirmedSale(
      sellerId,
      listingId,
      reason || 'Admin-reported: Seller marked as sold but buyer did not confirm receipt'
    );

    logger.info(`Unconfirmed sale reported: ${listingId} by admin. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Unconfirmed sale reported',
      data: {
        sellerStatus: result,
        listingId
      }
    });

  } catch (error) {
    logger.error('Report unconfirmed sale error:', error.message);
    res.status(500).json({ success: false, message: 'Error reporting unconfirmed sale' });
  }
};

// @desc   Block user (admin only)
// @route  POST /api/violations/block-user
// @access Private (Admin)
exports.blockUserAdmin = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and reason are required' 
      });
    }

    const result = await blockUser(userId, reason);

    logger.info(`User blocked by admin: ${userId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'User blocked successfully',
      data: result
    });

  } catch (error) {
    logger.error('Block user error:', error.message);
    res.status(500).json({ success: false, message: 'Error blocking user' });
  }
};

// @desc   Unblock user (admin only)
// @route  POST /api/violations/unblock-user
// @access Private (Admin)
exports.unblockUserAdmin = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    const result = await unblockUser(userId, reason || 'Admin decision');

    logger.info(`User unblocked by admin: ${userId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'User unblocked successfully',
      data: result
    });

  } catch (error) {
    logger.error('Unblock user error:', error.message);
    res.status(500).json({ success: false, message: 'Error unblocking user' });
  }
};

// @desc   Reset user scores (admin only)
// @route  POST /api/violations/reset-scores
// @access Private (Admin)
exports.resetScoresAdmin = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    const result = await resetUserScores(userId, reason || 'Admin reset');

    logger.info(`Scores reset by admin: ${userId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Scores reset successfully',
      data: result
    });

  } catch (error) {
    logger.error('Reset scores error:', error.message);
    res.status(500).json({ success: false, message: 'Error resetting scores' });
  }
};
