const mongoose = require('mongoose');

const db = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Don't kill the process — keep the server up so requests get a real
    // HTTP error response instead of a dead connection (which browsers
    // misreport as a CORS failure). Retry after a delay instead.
    setTimeout(db, 5000);
  }
};

module.exports = db;