// backend/src/models/Chat.js
const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessage: { type: String, default: '' },
  lastMessageTime: { type: Date, default: Date.now },
  unreadBuyer: { type: Boolean, default: false },
  unreadSeller: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);
