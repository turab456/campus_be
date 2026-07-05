// backend/src/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  spamScore: { type: Number, default: 0, min: 0, max: 100 },
  flagged: { type: Boolean, default: false },
  flagReason: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
