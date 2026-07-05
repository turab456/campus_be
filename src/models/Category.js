// backend/src/models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  icon: { type: String }, // optional icon URL
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
