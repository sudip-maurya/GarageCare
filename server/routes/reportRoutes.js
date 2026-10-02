const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getInsuranceReport,
  getMasterReportData,
  exportCsvReport
} = require('../controllers/reportController');

router.use(protect);

router.get('/insurance', getInsuranceReport);
router.get('/master', getMasterReportData);
router.get('/export', exportCsvReport);

module.exports = router;
