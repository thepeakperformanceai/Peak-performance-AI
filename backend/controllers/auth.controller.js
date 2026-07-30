const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const PendingSignup = require('../models/PendingSignup.model');
const { sendOtpEmail, sendResetEmail } = require('../services/email.service');

const OTP_TTL_MINUTES = 10;      // how long a code stays valid
const PENDING_TTL_MINUTES = 60;  // how long an unfinished signup survives
const MAX_OTP_ATTEMPTS = 5;      // wrong guesses before the code is burned
const RESEND_COOLDOWN_SEC = 60;

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Password policy — mirrored on the client, enforced here so the API can't be bypassed
const PASSWORD_RULE =
  'Password must be at least 8 characters and include a capital letter and a special character.';
const isStrongPassword = (pw) =>
  typeof pw === 'string' &&
  pw.length >= 8 &&
  /[A-Z]/.test(pw) &&
  /[^A-Za-z0-9]/.test(pw);

const fail = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * POST /api/auth/signup
 * Body: { name, email, password, confirmPassword }
 *
 * Does NOT create a User — it stages the signup and emails a code.
 * The account is only created once the code is verified.
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      throw fail('All fields are required.', 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw fail('Please enter a valid email address.', 400);
    }
    if (!isStrongPassword(password)) {
      throw fail(PASSWORD_RULE, 400);
    }
    if (password !== confirmPassword) {
      throw fail('Passwords do not match.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      throw fail('An account with this email already exists.', 409);
    }

    const otp = generateOtp();
    const now = Date.now();

    // Upsert: restarting a signup replaces the previous pending record
    await PendingSignup.findOneAndUpdate(
      { email: cleanEmail },
      {
        name: name.trim(),
        email: cleanEmail,
        password: await bcrypt.hash(password, 12),
        otpHash: await bcrypt.hash(otp, 10),
        otpExpiresAt: new Date(now + OTP_TTL_MINUTES * 60 * 1000),
        attempts: 0,
        lastSentAt: new Date(now),
        expiresAt: new Date(now + PENDING_TTL_MINUTES * 60 * 1000)
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendOtpEmail(cleanEmail, name.trim(), otp, OTP_TTL_MINUTES);

    res.status(200).json({
      message: `Verification code sent to ${cleanEmail}`,
      email: cleanEmail,
      expiresInMinutes: OTP_TTL_MINUTES
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 *
 * On success the User is created and a token is issued — no separate login step.
 */
const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw fail('Email and verification code are required.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const pending = await PendingSignup.findOne({ email: cleanEmail });

    if (!pending) {
      throw fail('No pending signup found for this email. Please sign up again.', 404);
    }
    if (pending.otpExpiresAt < new Date()) {
      throw fail('This code has expired. Request a new one.', 400);
    }
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      throw fail('Too many incorrect attempts. Request a new code.', 429);
    }

    const match = await bcrypt.compare(String(otp).trim(), pending.otpHash);

    if (!match) {
      pending.attempts += 1;
      await pending.save();
      const left = MAX_OTP_ATTEMPTS - pending.attempts;
      throw fail(
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. Too many attempts — request a new code.',
        400
      );
    }

    // Race guard: someone may have registered this email in the meantime
    if (await User.findOne({ email: cleanEmail })) {
      await PendingSignup.deleteOne({ _id: pending._id });
      throw fail('An account with this email already exists.', 409);
    }

    const user = new User({
      name: pending.name,
      email: pending.email,
      password: pending.password,     // already hashed
      emailVerifiedAt: new Date()
    });
    user.$locals.passwordAlreadyHashed = true;
    await user.save();

    await PendingSignup.deleteOne({ _id: pending._id });

    res.status(201).json({
      message: 'Email verified. Account created.',
      token: signToken(user),
      user: user.toPublic()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-otp
 * Body: { email }
 */
const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw fail('Email is required.', 400);

    const cleanEmail = email.toLowerCase().trim();
    const pending = await PendingSignup.findOne({ email: cleanEmail });

    if (!pending) {
      throw fail('No pending signup found for this email. Please sign up again.', 404);
    }

    const sinceLast = (Date.now() - pending.lastSentAt.getTime()) / 1000;
    if (sinceLast < RESEND_COOLDOWN_SEC) {
      throw fail(
        `Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - sinceLast)}s before requesting another code.`,
        429
      );
    }

    const otp = generateOtp();
    const now = Date.now();

    pending.otpHash = await bcrypt.hash(otp, 10);
    pending.otpExpiresAt = new Date(now + OTP_TTL_MINUTES * 60 * 1000);
    pending.attempts = 0;
    pending.lastSentAt = new Date(now);
    pending.expiresAt = new Date(now + PENDING_TTL_MINUTES * 60 * 1000);
    await pending.save();

    await sendOtpEmail(pending.email, pending.name, otp, OTP_TTL_MINUTES);

    res.json({
      message: `New code sent to ${pending.email}`,
      expiresInMinutes: OTP_TTL_MINUTES
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw fail('Email and password are required.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();

    // password has select:false, so ask for it explicitly
    const user = await User.findOne({ email: cleanEmail }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // If they started a signup but never verified, say something useful
      if (!user && (await PendingSignup.exists({ email: cleanEmail }))) {
        throw fail('This email is not verified yet. Please complete signup.', 403);
      }
      throw fail('Incorrect email or password.', 401);
    }

    res.json({
      message: 'Logged in successfully',
      token: signToken(user),
      user: user.toPublic()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me  (protected)
 */
const getMe = async (req, res) => {
  res.json({ user: req.user.toPublic() });
};

/**
 * PATCH /api/auth/password  (protected)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw fail('Current and new password are required.', 400);
    }
    if (!isStrongPassword(newPassword)) {
      throw fail(PASSWORD_RULE, 400);
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      throw fail('Passwords do not match.', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      throw fail('Current password is incorrect.', 401);
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};


const RESET_TTL_MINUTES = 30;

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Always responds the same way whether or not the account exists — otherwise
 * this endpoint becomes a way to check which emails are registered.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw fail('Email is required.', 400);

    const cleanEmail = email.toLowerCase().trim();
    const genericMessage =
      'If an account exists for that email, a reset link has been sent.';

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({ message: genericMessage });   // don't reveal non-existence
    }

    // Raw token goes in the emailed link; only its hash is stored
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await user.save();

    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${base}/?token=${rawToken}`;

    try {
      await sendResetEmail(user.email, user.name, resetUrl, RESET_TTL_MINUTES);
    } catch (mailErr) {
      // If the mail fails, don't leave a dangling token on the account
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      throw fail('Could not send the reset email. Please try again.', 500);
    }

    res.json({ message: genericMessage });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) throw fail('Token and new password are required.', 400);
    if (!isStrongPassword(password)) throw fail(PASSWORD_RULE, 400);

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+password +resetPasswordToken +resetPasswordExpires');

    if (!user) throw fail('This reset link is invalid or has expired.', 400);

    user.password = password;               // pre-save hook hashes it
    user.resetPasswordToken = undefined;    // single-use
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password updated. You can now log in.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { signup, verifyOtp, resendOtp, login, getMe, changePassword, forgotPassword, resetPassword };