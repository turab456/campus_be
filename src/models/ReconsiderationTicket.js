// backend/src/models/ReconsiderationTicket.js
const mongoose = require('mongoose');

const reconsiderationTicketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminComment: { type: String },
  resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('ReconsiderationTicket', reconsiderationTicketSchema);
