// Where Hassan keeps leads, bookings and message counts (MongoDB).
// The agent only talks to this small interface, so tests can swap in memory.
const HassanLead = require('../models/HassanLead.model');
const HassanBooking = require('../models/HassanBooking.model');
const HassanStat = require('../models/HassanStat.model');

const plain = (doc) => (doc ? JSON.parse(JSON.stringify(doc)) : null);

const mongoStore = {
  async getLead(phone) {
    return plain(await HassanLead.findOne({ phone }).lean());
  },
  async getLeadById(id) {
    return plain(await HassanLead.findById(id).lean());
  },
  async saveLead(lead) {
    const { _id, createdAt, updatedAt, __v, ...fields } = lead;
    return plain(await HassanLead.findOneAndUpdate({ phone: lead.phone }, { $set: fields }, { upsert: true, new: true, lean: true }));
  },
  async listLeads({ limit = 200 } = {}) {
    return plain(await HassanLead.find({}, { messages: { $slice: -1 } }).sort({ updatedAt: -1 }).limit(limit).lean());
  },
  async leadsAwaitingFollowUp() {
    return plain(await HassanLead.find({ paused: false, stage: { $in: ['new', 'qualified', 'slot_offered'] } }).lean());
  },
  async bookingsBetween(from, to) {
    return plain(await HassanBooking.find({ start: { $gte: from, $lt: to } }).sort({ start: 1 }).lean());
  },
  async createBooking(b) {
    return plain(await HassanBooking.create(b));
  },
  async saveBooking(b) {
    const { _id, createdAt, updatedAt, __v, ...fields } = b;
    return plain(await HassanBooking.findByIdAndUpdate(_id, { $set: fields }, { new: true, lean: true }));
  },
  async getStat(month) {
    return plain(await HassanStat.findOneAndUpdate({ month }, { $setOnInsert: { month } }, { upsert: true, new: true, lean: true }));
  },
  async bumpStat(month, field) {
    return plain(await HassanStat.findOneAndUpdate({ month }, { $inc: { [field]: 1 } }, { upsert: true, new: true, lean: true }));
  },
  async setStat(month, fields) {
    return plain(await HassanStat.findOneAndUpdate({ month }, { $set: fields }, { upsert: true, new: true, lean: true }));
  }
};

module.exports = { mongoStore };
