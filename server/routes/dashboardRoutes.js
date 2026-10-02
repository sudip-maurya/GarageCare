const express = require('express');
const router = express.Router();
const { getDashboardStats, exportReport } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.get('/stats', protect, getDashboardStats);
router.get('/export-report', protect, exportReport);

module.exports = router;
