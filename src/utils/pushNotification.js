// backend/src/utils/pushNotification.js
const webpush = require('web-push');
const { logger } = require('./logger');
const User = require('../models/User');

let isWebPushConfigured = false;

// Check env variables or generate dynamic VAPID keys as fallback
let publicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;
let subject = process.env.SMTP_USER || 'sufiturabhussain@gmail.com';
if (subject && !subject.startsWith('mailto:') && !subject.startsWith('http://') && !subject.startsWith('https://')) {
  subject = `mailto:${subject}`;
}

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  isWebPushConfigured = true;
  logger.info('[Web Push] VAPID details set successfully.');
} else {
  // Generate VAPID keys dynamically
  try {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isWebPushConfigured = true;
    logger.warn('[Web Push] VAPID credentials (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) are missing in .env.');
    logger.warn('[Web Push] Dynamically generated VAPID keys for this session:');
    logger.warn(`VAPID_PUBLIC_KEY="${publicKey}"`);
    logger.warn(`VAPID_PRIVATE_KEY="${privateKey}"`);
  } catch (err) {
    logger.error('[Web Push] Failed to generate dynamic VAPID keys:', err.message);
  }
}

const getVapidPublicKey = () => {
  return publicKey;
};

/**
 * Send Web Push notification to a user's registered browsers.
 * Automatically handles expired/invalid subscriptions.
 * 
 * @param {string} userId - Recipient user ID
 * @param {object} payload - Notification payload { title, body, data }
 */
const sendPushNotification = async (userId, { title, body, data = {} }) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      logger.info(`[Web Push] No registered push subscriptions for user ${userId}. Skipping.`);
      return;
    }

    logger.info(`[Web Push] Sending push notification to user ${userId} (${user.pushSubscriptions.length} subscriptions)`);

    const notificationPayload = JSON.stringify({
      title,
      body,
      icon: 'https://www.google.com/imgres?q=campus%20icon&imgurl=https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F4413%2F4413044.png&imgrefurl=https%3A%2F%2Fwww.flaticon.com%2Ffree-icon%2Fcampus_4413044&docid=j76O6mTx0au1DM&tbnid=FckRyNcGsEViQM&vet=12ahUKEwjsrf7-38CVAxUvoK8BHX83FgYQnPAOegQIeRAA..i&w=512&h=512&hcb=2&ved=2ahUKEwjsrf7-38CVAxUvoK8BHX83FgYQnPAOegQIeRAA',
      badge: 'https://www.google.com/imgres?q=campus%20icon&imgurl=https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F4413%2F4413044.png&imgrefurl=https%3A%2F%2Fwww.flaticon.com%2Ffree-icon%2Fcampus_4413044&docid=j76O6mTx0au1DM&tbnid=FckRyNcGsEViQM&vet=12ahUKEwjsrf7-38CVAxUvoK8BHX83FgYQnPAOegQIeRAA..i&w=512&h=512&hcb=2&ved=2ahUKEwjsrf7-38CVAxUvoK8BHX83FgYQnPAOegQIeRAA',
      data: {
        ...data,
        click_action: data.click_action || '/messages'
      }
    });

    const invalidSubscriptions = [];

    const sendPromises = user.pushSubscriptions.map(async (subscription) => {
      // Re-map db schema to web-push expected format
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, notificationPayload);
      } catch (err) {
        logger.warn(`[Web Push] Send failed for endpoint ${subscription.endpoint.substring(0, 30)}... Error: ${err.message}`);
        // Remove expired/invalid subscriptions (HTTP 410 Gone or 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          invalidSubscriptions.push(subscription.endpoint);
        }
      }
    });

    await Promise.all(sendPromises);

    if (invalidSubscriptions.length > 0) {
      logger.info(`[Web Push] Removing ${invalidSubscriptions.length} expired subscriptions for user ${userId}`);
      await User.findByIdAndUpdate(userId, {
        $pull: { pushSubscriptions: { endpoint: { $in: invalidSubscriptions } } }
      });
    }
  } catch (error) {
    logger.error('[Web Push Error] Failed to process push notification:', error.stack || error.message);
  }
};

module.exports = {
  sendPushNotification,
  getVapidPublicKey
};
