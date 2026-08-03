const mongoose = require('mongoose');

const marketingEventSchema = new mongoose.Schema({
  visitorId: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  eventType: {
    type: String,
    required: true,
    enum: [
      'visited',
      'signup_started',
      'registration_completed',
      'email_verified',
      'first_login',
      'profile_completed',
      'listing_created',
      'listing_approved',
      'chat_started',
      'sale_completed',
      'second_listing',
      'second_sale',
      'last_active'
    ],
    index: true
  },
  eventCategory: { type: String, index: true },
  channel: { type: String, index: true },
  utmSource: { type: String },
  utmMedium: { type: String },
  utmCampaign: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

marketingEventSchema.index({ eventType: 1, occurredAt: -1 });
marketingEventSchema.index({ userId: 1, eventType: 1 });

module.exports = mongoose.model('MarketingEvent', marketingEventSchema);
