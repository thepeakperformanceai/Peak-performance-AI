const mongoose = require('mongoose');

/**
 * A signup that has been submitted but not yet verified by email OTP.
 *
 * Keeping these out of the User collection means:
 *   - no unverified junk accounts to filter out of every query
 *   - nobody can squat on someone else's email by starting a signup
 *   - abandoned signups clean themselves up via the TTL index below
 */
const pendingSignupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,              // already bcrypt-hashed before it gets here
    required: true
  },
  otpHash: {
    type: String,
    required: true
  },
  otpExpiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0                 // wrong-code guesses, capped in the controller
  },
  lastSentAt: {
    type: Date,
    default: Date.now          // powers the resend cooldown
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

// TTL index — Mongo deletes the document once expiresAt passes
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);