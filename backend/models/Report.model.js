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
    // Recreational / Elite are what the upload form offers; without them those
    // reports failed to save.
    enum: ['Beginner', 'Intermediate', 'Semi-Professional', 'Professional', 'Recreational', 'Elite'],
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
  // ── Football (scoring engine) reports only ──
  // footballSession: the tester's entry, in the scoring engine's input shape.
  // Kept so a report can be re-scored when benchmarks change.
  footballSession: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  // scoring: the engine's full output; scoringPayload: exactly what Gemini saw.
  scoring: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  scoringPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  configVersion: {
    type: String,
    default: undefined
  },
  sex: {
    type: String,
    default: undefined
  },
  // ── Engine-scored sports other than football (padel) ──
  // scoringSport: which config scored it; scoringSession: the tester's entry.
  scoringSport: {
    type: String,
    default: undefined
  },
  scoringSession: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  // Custom assessments only: the scoring config built for that session and
  // the labels of its tests, so the report can be re-scored the same way.
  scoringConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  // Private link to this report's score breakdown (random, 192 bits). Unset = no link.
  breakdownToken: {
    type: String,
    default: undefined,
    index: { unique: true, sparse: true }
  },
  scoringTestInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  dominantHand: {
    type: String,
    default: undefined
  },
  bodyweightKg: {
    type: Number,
    default: undefined
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Report', reportSchema);