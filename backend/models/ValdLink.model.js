const mongoose = require('mongoose');

/**
 * Which VALD profile an athlete is. Saved when a tester picks the athlete in
 * "Pull from VALD", so next time the same name is found automatically.
 *
 * Shared across testers: the VALD organisation is one per company, and the
 * same athlete is tested by different staff.
 */
const valdLinkSchema = new mongoose.Schema({
  nameKey: {                   // normalized athlete name (case, accents, spaces ignored)
    type: String,
    required: true,
    unique: true
  },
  athleteName: { type: String, required: true },     // as typed on our form
  valdProfileId: { type: String, required: true },
  valdName: { type: String, default: '' },           // as spelt in VALD
  dateOfBirth: { type: String, default: null },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ValdLink', valdLinkSchema);
