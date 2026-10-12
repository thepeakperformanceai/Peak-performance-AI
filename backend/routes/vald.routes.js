const express = require('express');
const router = express.Router();
const valdController = require('../controllers/vald.controller');
const { adminOnly } = require('../middleware/auth.middleware');

/**
 * VALD routes (behind the login guard in server.js)
 */

// GET whether VALD is configured and reachable
router.get('/status', valdController.getStatus);

// GET step-by-step check of every VALD call (no secrets)
router.get('/diagnose', valdController.diagnose);

// GET athlete profiles by name
router.get('/profiles', valdController.searchProfiles);

// GET / PUT the VALD profile saved for an athlete (found automatically next time)
router.get('/link', valdController.getLink);
router.put('/link', valdController.saveLink);

// GET latest HumanTrak + Dynamo results mapped to a sport's test form
router.get('/latest', valdController.getLatest);

// GET raw latest tests for checking the field mapping (admins only)
router.get('/raw', adminOnly, valdController.getRaw);

module.exports = router;
