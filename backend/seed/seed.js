const mongoose = require('mongoose');
require('dotenv').config();
const Exercise = require('../models/Exercise.model');
const exercises = require('./exercises.json');

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Check if exercises already exist
    const count = await Exercise.countDocuments();
    if (count > 0) {
      console.log(`✓ Database already seeded with ${count} exercises`);
      await mongoose.connection.close();
      return;
    }

    // Insert all exercises
    const result = await Exercise.insertMany(exercises);
    console.log(`✓ Seeded ${result.length} exercises into database`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
};

seedDatabase();
