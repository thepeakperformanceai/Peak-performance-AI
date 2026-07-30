const express = require('express');
const router = express.Router();
const exerciseController = require('../controllers/exercise.controller');

/**
 * Exercise routes
 */

// GET all exercises
router.get('/', exerciseController.getAllExercises);

// POST create new exercise
router.post('/', exerciseController.createExercise);

// PUT update exercise
router.put('/:id', exerciseController.updateExercise);

// DELETE exercise
router.delete('/:id', exerciseController.deleteExercise);

module.exports = router;
