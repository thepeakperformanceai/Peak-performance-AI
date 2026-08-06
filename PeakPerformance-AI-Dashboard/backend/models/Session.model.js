const mongoose = require('mongoose');

// A generated assessment for a member — this system's equivalent of a "report".
// reportContent is whatever the main app's engine returned; dashboardMetrics are
// the clean numbers the dashboard charts.
const sessionSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gym:    { type: mongoose.Schema.Types.ObjectId, ref: 'Gym',  required: true, index: true },

  athleteName: String,
  age: Number,
  sport: String,

  dashboardMetrics: {
    cmj:        { type: Number, default: null },
    grip:       { type: Number, default: null },
    asym:       { type: Number, default: null },
    hipFlexion: { type: Number, default: null }
  },

  reportContent: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', sessionSchema);
