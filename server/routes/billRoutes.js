const express = require('express');
const router = express.Router();
const {
  getBills,
  getBillById,
  getBillByServiceId,
  createBill,
  updateBill,
  updateBillStatus,
  deleteBill
} = require('../controllers/billController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getBills)
  .post(protect, createBill);

router.route('/:id')
  .get(protect, getBillById)
  .put(protect, updateBill)
  .delete(protect, deleteBill);

router.route('/service/:serviceId')
  .get(protect, getBillByServiceId);

router.patch('/:id/status', protect, updateBillStatus);

module.exports = router;
