// backend/src/models/Job.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true, 
    index: true 
  },
  payload: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending', 
    index: true 
  },
  attempts: { 
    type: Number, 
    default: 0 
  },
  maxAttempts: { 
    type: Number, 
    default: 5 
  },
  error: { 
    type: String 
  },
  runAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
