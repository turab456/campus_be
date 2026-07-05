// backend/src/models/FraudReport.js
const mongoose = require('mongoose');

const fraudReportSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemType: { type: String, enum: ['user', 'listing'], required: true },
  reason: { type: String, required: true },
  score: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

module.exports = mongoose.model('FraudReport', fraudReportSchema);
