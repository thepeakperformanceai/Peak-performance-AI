const express = require('express');
const router = express.Router();
const upload = require('../middleware/multer');
const reportController = require('../controllers/report.controller');

/**
 * Report routes
 */

// GET all reports
router.get('/', reportController.getAllReports);

// POST generate report - accepts multiple files + athlete profile
router.post('/generate', upload.array('files', 10), reportController.generateReport);

// POST extract athlete profile from PDFs (autofill)
router.post('/extract', upload.array('files', 10), reportController.extractProfile);

// POST regenerate existing report
router.post('/:id/regenerate', reportController.regenerateReport);

// GET report by ID
router.get('/:id', reportController.getReport);

// GET report for PDF export
router.get('/:id/export', reportController.exportReportPdf);

// DELETE report
router.delete('/:id', reportController.deleteReportById);

module.exports = router;