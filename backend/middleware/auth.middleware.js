const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

/**
 * Verifies the Bearer token and attaches req.user
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      const err = new Error('Not authenticated. Please log in.');
      err.statusCode = 401;
      throw err;
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      const err = new Error('This account no longer exists.');
      err.statusCode = 401;
      throw err;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.statusCode = 401;
      error.message = 'Session expired. Please log in again.';
    }
    next(error);
  }
};

/**
 * Restricts a route to admins
 */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    const err = new Error('Admin access required.');
    err.statusCode = 403;
    return next(err);
  }
  next();
};

/**
 * Builds a Mongo filter scoped to the logged-in user.
 * Admins see everything; normal users only see their own docs.
 *
 *   Report.find(ownerFilter(req))
 *   Report.findOne(ownerFilter(req, { _id: id }))
 */
const ownerFilter = (req, extra = {}) => {
  if (req.user.role === 'admin') return { ...extra };
  return { ...extra, user: req.user._id };
};

module.exports = { protect, adminOnly, ownerFilter };