// backend/src/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'new_message',           // Someone sent you a message
      'sale_pending',          // Seller marked item as sold to you — confirm receipt
      'sale_confirmed',        // Buyer confirmed receipt
      'sale_denied',           // Buyer denied the sale
      'sale_canceled',         // Seller canceled pending sale
      'fraud_warning',         // Your account received a fraud/scam warning
      'listing_flagged',       // Your listing was flagged
      'moderation_block',      // A message or listing was blocked by moderation
      'general',               // General notification
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  // Optional references for deep-linking
  relatedListing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  relatedChat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Compound index for efficient querying
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
