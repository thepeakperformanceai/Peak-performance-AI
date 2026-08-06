const router = require('express').Router();
const upload = require('../middleware/multer');
const { protect } = require('../middleware/auth.middleware');
const { generateReport, myReports, getReport, myProgress } = require('../controllers/report.controller');

router.use(protect);
router.post('/generate', upload.array('files', 10), generateReport);
router.get('/mine', myReports);
router.get('/my-progress', myProgress);
router.get('/:id', getReport);

module.exports = router;
