const mongoose = require('mongoose');

/**
 * Admin's choice for one VALD test type (set on the "VALD test mapping"
 * screen). Nothing here is ever set automatically.
 *
 *   key:    VALD test type, e.g. "dynamo:kneeflexion" or "humantrak:TT_SQUAT-DL"
 *   use:    "stat" (listed under that stat) or "show" (show only)
 *   metric: HumanTrak metric group code to report for this test type
 *
 * Additional VALD results are shown on the report, grouped by stat, and are
 * never counted in the OVR.
 */
const STATS = ['speed', 'power', 'agility', 'balance', 'reaction', 'endurance'];

const valdTestMappingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  device: { type: String, enum: ['Dynamo', 'HumanTrak'], required: true },
  test: { type: String, default: '' },               // VALD's name, for display
  use: { type: String, enum: ['stat', 'show'], required: true },
  stat: { type: String, enum: [...STATS, null], default: null },
  metric: { type: String, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const ValdTestMapping = mongoose.model('ValdTestMapping', valdTestMappingSchema);
ValdTestMapping.STATS = STATS;
module.exports = ValdTestMapping;
