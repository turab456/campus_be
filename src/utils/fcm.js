// backend/src/utils/fcm.js
// Forward exports to standard Web Push to prevent breaking existing controller imports
const pushNotification = require('./pushNotification');

module.exports = {
  sendPushNotification: pushNotification.sendPushNotification
};
