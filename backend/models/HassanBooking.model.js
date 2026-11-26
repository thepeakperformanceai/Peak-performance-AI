const mongoose = require('mongoose');

// A slot Hassan booked.
const bookingSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'HassanLead' },
  phone: String,
  fullName: String,
  service: String,
  price: Number,
  slotId: { type: String, index: true },
  locationId: String,
  location: String,
  start: { type: Date, index: true },
  status: { type: String, enum: ['booked', 'cancelled', 'done', 'no_show'], default: 'booked' },
  remindersSent: { type: [String], default: [] },
  calendarEventId: String
}, { timestamps: true });

module.exports = mongoose.models.HassanBooking || mongoose.model('HassanBooking', bookingSchema);
