const mongoose = require('mongoose');

const marketingVisitorSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  sessionId: { type: String, index: true },
  campaignSource: { type: String, default: 'direct' },
  channel: { type: String, default: 'Direct' },
  utmSource: { type: String },
  utmMedium: { type: String },
  utmCampaign: { type: String },
  utmTerm: { type: String },
  utmContent: { type: String },
  ref: { type: String },
  referrer: { type: String },
  landingPage: { type: String },
  firstVisitAt: { type: Date, default: Date.now },
  lastVisitAt: { type: Date, default: Date.now },
  device: { type: String },
  browser: { type: String },
  operatingSystem: { type: String },
  country: { type: String },
  state: { type: String },
  city: { type: String },
  ipAddress: { type: String },
  funnel: {
    visitedAt: { type: Date },
    signupStartedAt: { type: Date },
    registrationCompletedAt: { type: Date },
    emailVerifiedAt: { type: Date },
    firstLoginAt: { type: Date },
    profileCompletedAt: { type: Date },
    firstListingCreatedAt: { type: Date },
    listingApprovedAt: { type: Date },
    firstChatStartedAt: { type: Date },
    firstSaleCompletedAt: { type: Date },
    secondListingAt: { type: Date },
    secondSaleAt: { type: Date },
    lastActiveAt: { type: Date }
  }
}, { timestamps: true });

marketingVisitorSchema.index({ 'funnel.registrationCompletedAt': 1 });
marketingVisitorSchema.index({ 'funnel.firstSaleCompletedAt': 1 });
marketingVisitorSchema.index({ channel: 1, campaignSource: 1 });
marketingVisitorSchema.index({ utmCampaign: 1 });
marketingVisitorSchema.index({ ref: 1 });

module.exports = mongoose.model('MarketingVisitor', marketingVisitorSchema);
