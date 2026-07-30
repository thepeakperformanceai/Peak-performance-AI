const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Exercise name is required'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Exercise description is required']
  },
  targets: {
    type: String,
    required: [true, 'Target muscles are required'],
    help: 'Comma-separated list of target areas (e.g., "Core, Glutes, Hips")'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Exercise', exerciseSchema);
