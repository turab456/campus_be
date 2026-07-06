// backend/src/controllers/reconsiderationController.js
const ReconsiderationTicket = require('../models/ReconsiderationTicket');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { sendPushNotification } = require('../utils/fcm');

// Create a new reconsideration ticket (User action)
exports.createTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a valid explanation.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify user is actually in danger/warning/blocked zone
    if (user.spamScore === 0 && user.scamScore === 0 && !user.flagged && !user.blocked) {
      return res.status(400).json({
        success: false,
        message: 'Your account is in good standing. You do not need to submit a reconsideration ticket.'
      });
    }

    // Check for any pending ticket
    const existingPending = await ReconsiderationTicket.findOne({ user: userId, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: 'You already have a reconsideration request pending review.'
      });
    }

    const ticket = await ReconsiderationTicket.create({
      user: userId,
      reason: reason.trim(),
      status: 'pending'
    });

    logger.info(`Reconsideration ticket created for user: ${user.email}`);
    res.status(201).json({ success: true, message: 'Appeal ticket submitted successfully.', ticket });
  } catch (error) {
    logger.error('Create appeal error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get current user's appeal history/status (User action)
exports.getMyStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const tickets = await ReconsiderationTicket.find({ user: userId }).sort({ createdAt: -1 });
    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('Get my status error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all appeal tickets (Admin action)
exports.getAdminTickets = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status !== 'all') {
      filter.status = status;
    }

    const tickets = await ReconsiderationTicket.find(filter)
      .populate('user', 'name email spamScore scamScore blocked flagged')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await ReconsiderationTicket.countDocuments(filter);

    res.json({
      success: true,
      data: tickets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Get admin tickets error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Resolve an appeal ticket (Admin action)
exports.resolveTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, adminComment } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be approve or reject.' });
    }

    const ticket = await ReconsiderationTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This ticket has already been resolved.' });
    }

    const user = await User.findById(ticket.user);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Associated user not found.' });
    }

    if (action === 'approve') {
      // Clear user violation scores and remove them from danger zone
      user.spamScore = 0;
      user.scamScore = 0;
      user.violationCount = 0;
      user.blocked = false;
      user.flagged = false;
      user.blockReason = undefined;
      user.flagReason = undefined;
      user.blockedAt = undefined;
      user.warnings = []; // Clear warnings history

      await user.save();

      ticket.status = 'approved';
      logger.info(`Reconsideration approved for user ${user.email}. Violation scores cleared.`);

      // Send FCM push alert asynchronously
      sendPushNotification(user._id, {
        title: 'Appeal Request Approved',
        body: 'Your account appeal has been approved! Your status is restored to active.',
        data: { type: 'appeal_approved', click_action: '/home' }
      }).catch(err => logger.error('[FCM Warning] Failed to dispatch appeal approval push:', err));
    } else {
      ticket.status = 'rejected';
      logger.info(`Reconsideration appeal rejected for user ${user.email}.`);

      // Send FCM push alert asynchronously
      sendPushNotification(user._id, {
        title: 'Appeal Request Rejected',
        body: `Your account appeal has been rejected: ${adminComment || 'Appeal denied by moderation'}`,
        data: { type: 'appeal_rejected', reason: adminComment, click_action: '/profile' }
      }).catch(err => logger.error('[FCM Warning] Failed to dispatch appeal rejection push:', err));
    }

    ticket.adminComment = adminComment || '';
    ticket.resolvedAt = new Date();
    await ticket.save();

    res.json({ success: true, message: `Appeal has been ${ticket.status}.`, ticket });
  } catch (error) {
    logger.error('Resolve ticket error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
