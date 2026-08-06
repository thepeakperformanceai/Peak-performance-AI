const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One collection for both gym owners and members in THIS system's own database.
const userSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true,
           match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'] },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['gymOwner', 'member'], required: true },
  gym:  { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', index: true, default: null },
  mustChangePassword: { type: Boolean, default: false },
  memberProfile: {
    sex:   { type: String, enum: ['M', 'F', ''], default: '' },
    age:   { type: Number, default: null },
    sport: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function (c) { return bcrypt.compare(c, this.password); };
userSchema.methods.toPublic = function () {
  return {
    _id: this._id, name: this.name, email: this.email, role: this.role,
    gym: this.gym, mustChangePassword: this.mustChangePassword,
    memberProfile: this.memberProfile, createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
