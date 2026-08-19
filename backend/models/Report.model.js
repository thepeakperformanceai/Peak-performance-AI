const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  athleteName: {
    type: String,
    required: [true, 'Athlete name is required']
  },
  age: {
    type: Number,
    required: [true, 'Age is required']
  },
  sport: {
    type: String,
    required: [true, 'Sport is required']
  },
  // ── New cover fields ──
  dob: {
    type: String,
    default: ''
  },
  weight: {
    type: String,
    default: ''
  },
  academy: {
    type: String,
    default: ''
  },
  position: {
    type: String,
    default: ''
  },
  trainingLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Semi-Professional', 'Professional'],
    required: [true, 'Training level is required']
  },
  knownInjuries: {
    type: String,
    default: ''
  },
  customParams: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  testDate: {
    type: String,
    default: () => new Date().toLocaleDateString()
  },
  practitioner: {
    type: String,
    default: 'Not specified'
  },
  // Flexible: stores whatever shape the report engine produces (battery card,
  // or any future format). Mixed prevents Mongoose from stripping unknown fields.
  reportContent: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  rawAiResponse: {
    type: String,
    default: ''
  },
  // ── Source PDF text, kept so "Regenerate" can re-run against real data
  // instead of just the previous report's finding titles ──
  sourcePdfData: {
    type: [
      {
        type: { type: String },   // 'HumanTrak' | 'Dynamo' | other
        text: String
      }
    ],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Report', reportSchema);