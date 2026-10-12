const express = require('express');
const router = express.Router();
const valdController = require('../controllers/vald.controller');
const { adminOnly } = require('../middleware/auth.middleware');

/**
 * VALD routes (behind the login guard in server.js)
 */

// GET whether VALD is configured and reachable
router.get('/status', valdController.getStatus);

// GET athlete profiles by name
router.get('/profiles', valdController.searchProfiles);

// GET latest HumanTrak + Dynamo results mapped to a sport's test form
router.get('/latest', valdController.getLatest);

// GET raw latest tests for checking the field mapping (admins only)
router.get('/raw', adminOnly, valdController.getRaw);

module.exports = router;
