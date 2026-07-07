// backend/src/controllers/notificationController.js
const User = require('../models/User');
const { getVapidPublicKey } = require('../utils/pushNotification');
const { logger } = require('../utils/logger');

exports.getPublicKey = (req, res) => {
  const key = getVapidPublicKey();
  res.json({ success: true, publicKey: key });
};

exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check if this subscription already exists for the user
    const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
      user.pushSubscriptions.push(subscription);
      await user.save();
      logger.info(`[Web Push] Registered new subscription for user ${user.email}`);
    }

    res.json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    logger.error('[Web Push Controller] Subscribe error:', error.message);
    res.status(500).json({ success: false, message: 'Server error registering subscription.' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint is required.' });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { pushSubscriptions: { endpoint } }
    });
    logger.info(`[Web Push] Removed subscription for user ${req.user.id}`);

    res.json({ success: true, message: 'Push subscription removed successfully.' });
  } catch (error) {
    logger.error('[Web Push Controller] Unsubscribe error:', error.message);
    res.status(500).json({ success: false, message: 'Server error removing subscription.' });
  }
};
