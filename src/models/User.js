// backend/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  college: { type: String },
  department: { type: String },
  semester: { type: Number },
  avatarUrl: { type: String },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
  rating: { type: Number, default: 5.0 },
  reviewsCount: { type: Number, default: 0 },
  spamScore: { type: Number, default: 0, min: 0, max: 100 },
  scamScore: { type: Number, default: 0, min: 0, max: 100 },
  flagged: { type: Boolean, default: false },
  flagReason: { type: String },
  blocked: { type: Boolean, default: false },
  blockReason: { type: String },
  blockedAt: { type: Date },
  warnings: [{
    reason: String,
    spamScore: Number,
    scamScore: Number,
    createdAt: { type: Date, default: Date.now }
  }],
  violationCount: { type: Number, default: 0 },
  fcmTokens: [{ type: String }],
}, { timestamps: true });

// hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (enteredPwd) {
  return bcrypt.compare(enteredPwd, this.password);
};

module.exports = mongoose.model('User', userSchema);
