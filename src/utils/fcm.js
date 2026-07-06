// backend/src/utils/fcm.js
const admin = require('firebase-admin');
const { logger } = require('./logger');
const User = require('../models/User');

let messagingInstance = null;
let isFCMConfigured = false;

try {
  // Check if we have Firebase service account parameters in .env
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  // Handle newlines in private key
  const privateKey = process.env.FCM_PRIVATE_KEY
    ? process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
    messagingInstance = admin.messaging();
    isFCMConfigured = true;
    logger.info('[FCM] Firebase Cloud Messaging successfully initialized.');
  } else {
    logger.warn('[FCM] Firebase credentials (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) are missing in .env. Falling back to log simulation.');
  }
} catch (error) {
  logger.error('[FCM] Error initializing Firebase Admin SDK:', error.stack || error.message);
  logger.warn('[FCM] Falling back to log simulation for push notifications.');
}

/**
 * Send FCM push notification to a user's registered devices.
 * Removes stale tokens automatically on token invalidation.
 * 
 * @param {string} userId - Recipient user ID
 * @param {object} payload - Notification payload { title, body, data }
 */
async function sendPushNotification(userId, { title, body, data = {} }) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      logger.info(`[FCM] No registered FCM tokens for user ${userId}. Skipping push.`);
      return;
    }

    logger.info(`[FCM] Attempting to send push notification to user ${userId} (${user.fcmTokens.length} devices)`);
    logger.info(`[FCM] Payload: Title="${title}", Body="${body}"`);

    // In simulate mode or if not configured, just log to winston and return
    if (!isFCMConfigured || !messagingInstance) {
      logger.info(`[FCM] [SIMULATOR] Notification payload for user ${user.email}:`, { title, body, data });
      return;
    }

    // FCM Multicast payload
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: data.click_action || '/messages' // default path for web push click redirection
      },
      tokens: user.fcmTokens
    };

    const response = await messagingInstance.sendEachForMulticast(message);
    logger.info(`[FCM] Multicast send results: successCount=${response.successCount}, failureCount=${response.failureCount}`);

    // Clean up invalid/stale registration tokens
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          const token = user.fcmTokens[idx];
          logger.warn(`[FCM] Device send failed for token: ${token.substring(0, 10)}... Error Code: ${error.code}`);
          
          if (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(token);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        logger.info(`[FCM] Removing ${tokensToRemove.length} inactive/stale tokens for user ${userId}`);
        await User.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: tokensToRemove } }
        });
      }
    }
  } catch (error) {
    logger.error(`[FCM] Error sending push notification to user ${userId}:`, error.stack || error.message);
  }
}

module.exports = {
  sendPushNotification,
  isFCMConfigured: () => isFCMConfigured
};
