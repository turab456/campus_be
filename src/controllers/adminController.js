// backend/src/controllers/adminController.js
const User = require('../models/User');
const Listing = require('../models/Listing');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const Review = require('../models/Review');
const FraudReport = require('../models/FraudReport');
const { logger } = require('../utils/logger');
const { sendPushNotification } = require('../utils/fcm');

// Dashboard
exports.getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalListings = await Listing.countDocuments();
    const totalMessages = await Message.countDocuments();
    const flaggedUsers = await User.countDocuments({ flagged: true });
    const flaggedListings = await Listing.countDocuments({ flagged: true });
    const flaggedMessages = await Message.countDocuments({ flagged: true });

    // High risk users (spam/scam score > 60)
    const highRiskUsers = await User.find({
      $or: [{ spamScore: { $gt: 60 } }, { scamScore: { $gt: 60 } }]
    })
      .limit(5)
      .select('name email spamScore scamScore rating reviewsCount');

    // Recent spam/scam reports (flagged messages + user warning events)
    const flaggedMessagesList = await Message.find({ flagged: true })
      .limit(10)
      .populate('sender', 'name email')
      .sort({ createdAt: -1 });

    const usersWithWarnings = await User.find({ 'warnings.0': { $exists: true } });

    const messageReports = flaggedMessagesList.map(msg => ({
      _id: msg._id.toString(),
      messageId: msg._id.toString(),
      senderId: msg.sender ? msg.sender._id.toString() : '',
      senderName: msg.sender ? msg.sender.name : 'Unknown User',
      senderEmail: msg.sender ? msg.sender.email : 'N/A',
      text: msg.text,
      spamScore: msg.spamScore || 0,
      reason: msg.flagReason || 'Flagged as spam',
      createdAt: msg.createdAt
    }));

    const warningReports = [];
    usersWithWarnings.forEach(user => {
      user.warnings.forEach((warning, index) => {
        warningReports.push({
          _id: `${user._id}_warn_${index}`,
          messageId: null,
          senderId: user._id.toString(),
          senderName: user.name,
          senderEmail: user.email,
          text: `[User Warning] ${warning.reason}`,
          spamScore: warning.spamScore || warning.scamScore || 0,
          reason: warning.reason,
          createdAt: warning.createdAt
        });
      });
    });

    const combinedSpamReports = [...messageReports, ...warningReports]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalListings,
        totalMessages,
        flaggedUsers,
        flaggedListings,
        flaggedMessages,
        highRiskUsers,
        recentSpamReports: combinedSpamReports
      }
    });
  } catch (error) {
    logger.error('Dashboard error', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard' });
  }
};

// User Management
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, filter = 'all' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (filter === 'flagged') query.flagged = true;
    if (filter === 'unverified') query.isVerified = false;
    if (filter === 'high_risk') {
      query.$or = [{ spamScore: { $gt: 60 } }, { scamScore: { $gt: 60 } }];
    }

    const users = await User.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password')
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Get users error', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('wishlist', 'title price')
      .select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's listings
    const listings = await Listing.find({ seller: req.params.userId }).limit(5);

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        listingsCount: listings.length,
        recentListings: listings
      }
    });
  } catch (error) {
    logger.error('Get user details error', error);
    res.status(500).json({ success: false, message: 'Error fetching user details' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete user's listings
    await Listing.deleteMany({ seller: req.params.userId });

    // Delete user's messages
    await Message.deleteMany({ sender: req.params.userId });

    // Delete user
    await User.findByIdAndDelete(req.params.userId);

    logger.info(`User ${user.email} deleted by admin. Reason: ${reason}`);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error', error);
    res.status(500).json({ success: false, message: 'Error deleting user' });
  }
};

exports.flagUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { flagged: true, flagReason: reason },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User ${user.email} flagged. Reason: ${reason}`);

    // Send FCM push alert asynchronously
    sendPushNotification(user._id, {
      title: 'Account Flagged for Review',
      body: `Your account has been temporarily flagged for review: ${reason}`,
      data: { type: 'flagged', reason, click_action: '/profile' }
    }).catch(err => logger.error('[FCM Warning] Failed to dispatch flag user FCM push:', err));

    res.json({ success: true, message: 'User flagged', data: user });
  } catch (error) {
    logger.error('Flag user error', error);
    res.status(500).json({ success: false, message: 'Error flagging user' });
  }
};

exports.unflagUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { flagged: false, flagReason: null },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User ${user.email} unflagged`);

    // Send FCM push alert asynchronously
    sendPushNotification(user._id, {
      title: 'Account Review Cleared',
      body: 'Your account review has been completed. All restrictions have been lifted.',
      data: { type: 'unflagged', click_action: '/home' }
    }).catch(err => logger.error('[FCM Warning] Failed to dispatch unflag user FCM push:', err));

    res.json({ success: true, message: 'User unflagged', data: user });
  } catch (error) {
    logger.error('Unflag user error', error);
    res.status(500).json({ success: false, message: 'Error unflagging user' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { blocked: true, blockReason: reason, blockedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User ${user.email} blocked. Reason: ${reason}`);

    res.json({ success: true, message: 'User blocked/deactivated successfully', data: user });
  } catch (error) {
    logger.error('Block user error', error);
    res.status(500).json({ success: false, message: 'Error blocking user' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { blocked: false, blockReason: null, blockedAt: null },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User ${user.email} unblocked`);

    res.json({ success: true, message: 'User unblocked/activated successfully', data: user });
  } catch (error) {
    logger.error('Unblock user error', error);
    res.status(500).json({ success: false, message: 'Error unblocking user' });
  }
};

// Listing Management
exports.getAllListings = async (req, res) => {
  try {
    const { page = 1, limit = 10, filter = 'all' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (filter === 'flagged') query.flagged = true;
    if (filter === 'high_risk') query.fraudScore = { $gt: 60 };

    const listings = await Listing.find(query)
      .populate('seller', 'name email rating')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Listing.countDocuments(query);

    res.json({
      success: true,
      data: listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Get listings error', error);
    res.status(500).json({ success: false, message: 'Error fetching listings' });
  }
};

exports.getListingDetails = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.listingId)
      .populate('seller', 'name email rating reviewsCount')
      .populate('category', 'name');

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    res.json({ success: true, data: listing });
  } catch (error) {
    logger.error('Get listing details error', error);
    res.status(500).json({ success: false, message: 'Error fetching listing' });
  }
};

exports.approveListing = async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.listingId,
      { approved: true, flagged: false },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    logger.info(`Listing ${listing._id} approved`);

    res.json({ success: true, message: 'Listing approved', data: listing });
  } catch (error) {
    logger.error('Approve listing error', error);
    res.status(500).json({ success: false, message: 'Error approving listing' });
  }
};

exports.rejectListing = async (req, res) => {
  try {
    const { reason } = req.body;
    const listing = await Listing.findByIdAndUpdate(
      req.params.listingId,
      { approved: false, rejectReason: reason },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    logger.info(`Listing ${listing._id} rejected. Reason: ${reason}`);

    res.json({ success: true, message: 'Listing rejected', data: listing });
  } catch (error) {
    logger.error('Reject listing error', error);
    res.status(500).json({ success: false, message: 'Error rejecting listing' });
  }
};

exports.deleteListing = async (req, res) => {
  try {
    const { reason } = req.body;
    const listing = await Listing.findById(req.params.listingId);

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    await Listing.findByIdAndDelete(req.params.listingId);

    logger.info(`Listing ${listing._id} deleted. Reason: ${reason}`);

    res.json({ success: true, message: 'Listing deleted' });
  } catch (error) {
    logger.error('Delete listing error', error);
    res.status(500).json({ success: false, message: 'Error deleting listing' });
  }
};

exports.flagListing = async (req, res) => {
  try {
    const { reason } = req.body;
    const listing = await Listing.findByIdAndUpdate(
      req.params.listingId,
      { flagged: true, flagReason: reason },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    logger.info(`Listing ${listing._id} flagged. Reason: ${reason}`);

    res.json({ success: true, message: 'Listing flagged', data: listing });
  } catch (error) {
    logger.error('Flag listing error', error);
    res.status(500).json({ success: false, message: 'Error flagging listing' });
  }
};

// Fraud Reports
exports.getFraudReports = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const reports = await FraudReport.find()
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await FraudReport.countDocuments();

    res.json({
      success: true,
      data: reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Get fraud reports error', error);
    res.status(500).json({ success: false, message: 'Error fetching fraud reports' });
  }
};

exports.createFraudReport = async (req, res) => {
  try {
    const { itemId, itemType, reason, score } = req.body;

    // Create report in database
    await FraudReport.create({
      itemId,
      itemType,
      reason,
      score: Number(score) || 0
    });

    if (itemType === 'user') {
      await User.findByIdAndUpdate(itemId, {
        flagged: true,
        scamScore: Math.min(score, 100)
      });
    } else if (itemType === 'listing') {
      await Listing.findByIdAndUpdate(itemId, {
        flagged: true,
        fraudScore: Math.min(score, 100)
      });
    }

    res.json({ success: true, message: 'Fraud report created' });
  } catch (error) {
    logger.error('Create fraud report error', error);
    res.status(500).json({ success: false, message: 'Error creating fraud report' });
  }
};

// Spam Messages
exports.getSpamReports = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const limitInt = parseInt(limit);
    const pageInt = parseInt(page);

    const flaggedMessages = await Message.find({ flagged: true })
      .populate('sender', 'name email');

    const usersWithWarnings = await User.find({ 'warnings.0': { $exists: true } });

    const messageReports = flaggedMessages.map(msg => ({
      _id: msg._id.toString(),
      messageId: msg._id.toString(),
      senderId: msg.sender ? msg.sender._id.toString() : '',
      senderName: msg.sender ? msg.sender.name : 'Unknown User',
      senderEmail: msg.sender ? msg.sender.email : 'N/A',
      text: msg.text,
      spamScore: msg.spamScore || 0,
      reason: msg.flagReason || 'Flagged as spam',
      createdAt: msg.createdAt
    }));

    const warningReports = [];
    usersWithWarnings.forEach(user => {
      user.warnings.forEach((warning, index) => {
        warningReports.push({
          _id: `${user._id}_warn_${index}`,
          messageId: null,
          senderId: user._id.toString(),
          senderName: user.name,
          senderEmail: user.email,
          text: `[User Violation] ${warning.reason}`,
          spamScore: warning.spamScore || warning.scamScore || 0,
          reason: warning.reason,
          createdAt: warning.createdAt
        });
      });
    });

    const allReports = [...messageReports, ...warningReports]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allReports.length;
    const paginatedReports = allReports.slice((pageInt - 1) * limitInt, pageInt * limitInt);

    res.json({
      success: true,
      data: paginatedReports,
      pagination: {
        page: pageInt,
        limit: limitInt,
        total,
        pages: Math.ceil(total / limitInt)
      }
    });
  } catch (error) {
    logger.error('Get spam reports error', error);
    res.status(500).json({ success: false, message: 'Error fetching spam reports' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { reason } = req.body;
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    await Message.findByIdAndDelete(req.params.messageId);

    logger.info(`Message ${message._id} deleted. Reason: ${reason}`);

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    logger.error('Delete message error', error);
    res.status(500).json({ success: false, message: 'Error deleting message' });
  }
};

exports.reportSpam = async (req, res) => {
  try {
    const { messageId, reason } = req.body;
    const message = await Message.findByIdAndUpdate(
      messageId,
      {
        flagged: true,
        flagReason: reason,
        spamScore: 75 // Default high spam score
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Flag sender if multiple spam reports
    const senderSpamCount = await Message.countDocuments({
      sender: message.sender,
      flagged: true
    });

    if (senderSpamCount >= 3) {
      await User.findByIdAndUpdate(message.sender, {
        flagged: true,
        spamScore: Math.min(75, 100)
      });
    }

    logger.info(`Message ${messageId} reported as spam`);

    res.json({ success: true, message: 'Spam reported', data: message });
  } catch (error) {
    logger.error('Report spam error', error);
    res.status(500).json({ success: false, message: 'Error reporting spam' });
  }
};

// Statistics
exports.getUserStats = async (req, res) => {
  try {
    const stats = {
      totalUsers: await User.countDocuments(),
      verifiedUsers: await User.countDocuments({ isVerified: true }),
      flaggedUsers: await User.countDocuments({ flagged: true }),
      adminUsers: await User.countDocuments({ role: 'admin' })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Get user stats error', error);
    res.status(500).json({ success: false, message: 'Error fetching user stats' });
  }
};

exports.getListingStats = async (req, res) => {
  try {
    const stats = {
      totalListings: await Listing.countDocuments(),
      soldListings: await Listing.countDocuments({ isSold: true }),
      featuredListings: await Listing.countDocuments({ isFeatured: true }),
      flaggedListings: await Listing.countDocuments({ flagged: true })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Get listing stats error', error);
    res.status(500).json({ success: false, message: 'Error fetching listing stats' });
  }
};

exports.getSpamStats = async (req, res) => {
  try {
    const stats = {
      totalMessages: await Message.countDocuments(),
      flaggedMessages: await Message.countDocuments({ flagged: true }),
      highRiskMessages: await Message.countDocuments({ spamScore: { $gte: 70 } })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Get spam stats error', error);
    res.status(500).json({ success: false, message: 'Error fetching spam stats' });
  }
};
