const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      const e = new Error('Not authenticated. Please log in.'); e.statusCode = 401; throw e;
    }
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) { const e = new Error('This account no longer exists.'); e.statusCode = 401; throw e; }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.statusCode = 401; error.message = 'Session expired. Please log in again.';
    }
    next(error);
  }
};

const gymOwnerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'gymOwner') {
    const e = new Error('Gym owner access required.'); e.statusCode = 403; return next(e);
  }
  next();
};

module.exports = { protect, gymOwnerOnly };
