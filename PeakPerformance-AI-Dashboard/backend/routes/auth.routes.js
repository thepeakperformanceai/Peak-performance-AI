const router = require('express').Router();
const { signup, login, getMe, changePassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/password', protect, changePassword);

module.exports = router;
