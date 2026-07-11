// backend/src/controllers/notificationController.js
const Notification = require('../models/Notification');
const Chat = require('../models/Chat');
const { logger } = require('../utils/logger');

const { emitToUser } = require('../utils/socket');
const { sendPushNotification } = require('../utils/pushNotification');

/**
 * Helper: create a notification for a user.
 * Can be called from any controller.
 */
exports.createNotification = async ({ recipient, type, title, message, relatedListing, relatedChat, relatedUser }) => {
  try {
    const notif = await Notification.create({
      recipient,
      type,
      title,
      message,
      relatedListing: relatedListing || undefined,
      relatedChat: relatedChat || undefined,
      relatedUser: relatedUser || undefined,
    });

    const recipientIdStr = recipient.toString();

    // Emit real-time notification event for bell icon updates
    emitToUser(recipientIdStr, 'notification', notif);

    // Emit chat status update event if related to a transaction
    const saleEvents = ['sale_pending', 'sale_confirmed', 'sale_denied', 'sale_canceled'];
    if (saleEvents.includes(type) && relatedChat) {
      emitToUser(recipientIdStr, 'chat_status_updated', {
        chatId: relatedChat.toString(),
        listingId: relatedListing ? relatedListing.toString() : null,
        type: type
      });
    }

    // Send Push Notification
    sendPushNotification(recipientIdStr, {
      title,
      body: message,
      data: {
        type,
        click_action: relatedChat ? '/messages' : (relatedListing ? `/book/${relatedListing}` : '/home'),
        chatId: relatedChat ? relatedChat.toString() : undefined,
      }
    }).catch(err => {
      logger.error('Failed to send push notification within createNotification:', err.message);
    });

    return notif;
  } catch (err) {
    logger.error('Failed to create notification:', err.message);
    return null;
  }
};

/**
 * GET /api/notifications
 * Get all notifications for the logged-in user
 */
exports.getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ recipient: req.user.id });
    const unreadCount = await Notification.countDocuments({ recipient: req.user.id, read: false });

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Get notifications error:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
};

/**
 * GET /api/notifications/unread-count
 * Get just the unread count (lightweight for polling)
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await Notification.countDocuments({ recipient: userId, read: false });
    const unreadChatCount = await Chat.countDocuments({
      $or: [
        { buyer: userId, unreadBuyer: true },
        { seller: userId, unreadSeller: true }
      ]
    });
    res.json({ success: true, unreadCount, unreadChatCount });
  } catch (error) {
    logger.error('Get unread count error:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching unread count' });
  }
};

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, notification: notif });
  } catch (error) {
    logger.error('Mark as read error:', error.message);
    res.status(500).json({ success: false, message: 'Error updating notification' });
  }
};

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for the current user
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { read: true }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all read error:', error.message);
    res.status(500).json({ success: false, message: 'Error updating notifications' });
  }
};
