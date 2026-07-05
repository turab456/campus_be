// backend/src/models/Listing.js
const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String },
  description: { type: String },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  condition: { type: String, enum: ['New', 'Like New', 'Very Good', 'Good', 'Acceptable'], default: 'Good' },
  images: [{ type: String }], // URLs from Cloudinary
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  college: { type: String },
  department: { type: String },
  semester: { type: Number },
  pickupLocation: { type: String },
  isFeatured: { type: Boolean, default: false },
  isPopular: { type: Boolean, default: false },
  isSold: { type: Boolean, default: false },
  salePending: { type: Boolean, default: false },
  soldAt: { type: Date },
  buyerConfirmedReceipt: { type: Boolean, default: false },
  confirmedAt: { type: Date },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fraudScore: { type: Number, default: 0, min: 0, max: 100 },
  flagged: { type: Boolean, default: false },
  flagReason: { type: String },
  approved: { type: Boolean, default: true },
  rejectReason: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);
