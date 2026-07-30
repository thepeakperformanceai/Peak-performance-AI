const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false            // never returned by default queries
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  emailVerifiedAt: {
    type: Date,
    default: Date.now        // users only reach this collection after OTP verification
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * Hash the password before saving.
 *
 * The OTP flow hashes the password up front (while it sits in PendingSignup),
 * so on that path we set `user.$locals.passwordAlreadyHashed = true` to avoid
 * bcrypt-ing an existing bcrypt hash.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.$locals.passwordAlreadyHashed) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Safe object to send to the client
userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);