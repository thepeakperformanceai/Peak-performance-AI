const mongoose = require('mongoose');

// Monthly count of paid-type messages, to stay inside Meta's free allowance.
const statSchema = new mongoose.Schema({
  month: { type: String, unique: true },   // "2026-11"
  serviceSent: { type: Number, default: 0 }, // service replies outside an ad's free window
  templatesSent: { type: Number, default: 0 },
  warned: { type: Boolean, default: false },
  limitAlerted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.HassanStat || mongoose.model('HassanStat', statSchema);
