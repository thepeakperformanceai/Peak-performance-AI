/**
 * One-off migration: assign every existing report to a user.
 *
 * Existing reports were created before user-scoping, so they have no `user`
 * field and will be invisible to everyone. This assigns them to one account.
 *
 * Usage:
 *   node scripts/backfillReportOwners.js owner@example.com
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');
const Report = require('../models/Report.model');

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/backfillReportOwners.js <email>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email ${email}. Sign that account up first.`);
    process.exit(1);
  }

  const result = await Report.updateMany(
    { $or: [{ user: { $exists: false } }, { user: null }] },
    { $set: { user: user._id } }
  );

  console.log(`Assigned ${result.modifiedCount} orphaned report(s) to ${user.email}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});