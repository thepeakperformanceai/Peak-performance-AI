const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const Gym = require('../models/Gym.model');

const fail = (m, c) => { const e = new Error(m); e.statusCode = c; return e; };
const signToken = (u) =>
  jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET,
           { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const isStrong = (pw) =>
  typeof pw === 'string' && pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
const PW_RULE = 'Password must be at least 8 characters and include a capital letter and a special character.';

/**
 * POST /api/auth/signup  — gym owner self-registration (no OTP in this system).
 * Body: { name, email, password, confirmPassword }
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    if (!name || !email || !password) throw fail('Name, email and password are required.', 400);
    if (!isStrong(password)) throw fail(PW_RULE, 400);
    if (confirmPassword !== undefined && password !== confirmPassword)
      throw fail('Passwords do not match.', 400);

    const cleanEmail = email.toLowerCase().trim();
    if (await User.findOne({ email: cleanEmail })) throw fail('An account with this email already exists.', 409);

    const owner = new User({ name: name.trim(), email: cleanEmail, password, role: 'gymOwner' });
    await owner.save();

    const gym = await Gym.create({ name: `${name.trim()}'s Gym`, owner: owner._id });
    owner.gym = gym._id;
    await owner.save();

    res.status(201).json({ message: 'Account created.', token: signToken(owner), user: owner.toPublic() });
  } catch (e) { next(e); }
};

/**
 * POST /api/auth/login  — owners and members
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw fail('Email and password are required.', 400);

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(password))) throw fail('Incorrect email or password.', 401);

    res.json({
      message: 'Logged in.',
      token: signToken(user),
      mustChangePassword: user.mustChangePassword || false,
      user: user.toPublic()
    });
  } catch (e) { next(e); }
};

/** GET /api/auth/me */
const getMe = async (req, res) => res.json({ user: req.user.toPublic() });

/** PATCH /api/auth/password  (protected) — also clears mustChangePassword */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword) throw fail('Current and new password are required.', 400);
    if (!isStrong(newPassword)) throw fail(PW_RULE, 400);
    if (confirmPassword !== undefined && newPassword !== confirmPassword)
      throw fail('Passwords do not match.', 400);

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) throw fail('Current password is incorrect.', 401);

    user.password = newPassword;
    if (user.mustChangePassword) user.mustChangePassword = false;
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch (e) { next(e); }
};

module.exports = { signup, login, getMe, changePassword };
