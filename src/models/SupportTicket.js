// backend/src/models/SupportTicket.js
const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  type: { type: String, enum: ['contact', 'support'], required: true },
  topic: { type: String, required: true }, // topic selection or issue type
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' }
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
