const mongoose = require('mongoose');

// One WhatsApp contact talking to Hassan, with the whole chat.
const messageSchema = new mongoose.Schema({
  by: { type: String, enum: ['lead', 'hassan', 'staff', 'system'], required: true },
  text: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  waId: { type: String },              // WhatsApp message id (dedupe)
  kind: { type: String, default: 'text' }, // text | template | note
  failed: { type: Boolean, default: false }
}, { _id: false });

const leadSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  profileName: String,
  name: String,
  fullName: String,
  stage: { type: String, enum: ['new', 'qualified', 'slot_offered', 'booked', 'handoff', 'lost'], default: 'new', index: true },
  service: String,

  fromAd: { type: Boolean, default: false },
  adEntryAt: Date,
  adHeadline: String,

  paused: { type: Boolean, default: false },  // Hassan stays quiet; a person replies
  handoffTo: String,                          // faraz | physio
  handoffReason: String,
  mentionedPain: { type: Boolean, default: false }, // told us about pain/injury → steered to physio
  lastAlertAt: Date,

  firstInboundAt: Date,
  lastInboundAt: Date,
  lastOutboundAt: Date,
  followUpsSent: { type: [String], default: [] }, // same_day, day1, day3, day7

  messages: { type: [messageSchema], default: [] }
}, { timestamps: true });

leadSchema.index({ updatedAt: -1 });

module.exports = mongoose.models.HassanLead || mongoose.model('HassanLead', leadSchema);
