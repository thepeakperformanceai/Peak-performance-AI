const Exercise = require('../models/Exercise.model');

/**
 * GET /api/exercises - Get all exercises
 */
const getAllExercises = async (req, res, next) => {
  try {
    const exercises = await Exercise.find().sort({ createdAt: -1 });
    res.json({
      count: exercises.length,
      exercises
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/exercises - Create new exercise
 */
const createExercise = async (req, res, next) => {
  try {
    const { name, description, targets } = req.body;

    if (!name || !description || !targets) {
      const err = new Error('name, description, and targets are required');
      err.statusCode = 400;
      throw err;
    }

    const exercise = new Exercise({
      name,
      description,
      targets
    });

    await exercise.save();
    res.status(201).json({
      message: 'Exercise created successfully',
      exercise
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 400;
      error.message = 'Exercise with this name already exists';
    }
    next(error);
  }
};

/**
 * PUT /api/exercises/:id - Update exercise
 */
const updateExercise = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, targets } = req.body;

    const exercise = await Exercise.findByIdAndUpdate(
      id,
      { name, description, targets },
      { new: true, runValidators: true }
    );

    if (!exercise) {
      const err = new Error('Exercise not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({
      message: 'Exercise updated successfully',
      exercise
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 400;
      error.message = 'Exercise with this name already exists';
    }
    next(error);
  }
};

/**
 * DELETE /api/exercises/:id - Delete exercise
 */
const deleteExercise = async (req, res, next) => {
  try {
    const { id } = req.params;

    const exercise = await Exercise.findByIdAndDelete(id);

    if (!exercise) {
      const err = new Error('Exercise not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({
      message: 'Exercise deleted successfully',
      exercise
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllExercises,
  createExercise,
  updateExercise,
  deleteExercise
};
