const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getReminders,
  getReminderStats,
  syncReminders,
  updateReminderStatus
} = require('../controllers/reminderController');

router.use(protect);

router.get('/', getReminders);
router.get('/stats', getReminderStats);
router.post('/sync', syncReminders);
router.patch('/:id/status', updateReminderStatus);

module.exports = router;
