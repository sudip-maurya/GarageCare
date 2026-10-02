const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getSettings, updateSettings, getInsuranceAgent, saveInsuranceAgent } = require('../controllers/settingsController');

router.use(protect);

router.get('/insurance-agent', getInsuranceAgent);
router.put('/insurance-agent', saveInsuranceAgent);
router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
