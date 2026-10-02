const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const uploadQr = require('../middleware/qrUpload');
const {
  getPaymentAccounts,
  getPaymentAccountById,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  togglePaymentAccountStatus,
  setDefaultPaymentAccount
} = require('../controllers/paymentAccountController');

router.use(protect);

router.route('/')
  .get(getPaymentAccounts)
  .post(uploadQr.single('qrCode'), createPaymentAccount);

router.route('/:id')
  .get(getPaymentAccountById)
  .put(uploadQr.single('qrCode'), updatePaymentAccount)
  .delete(deletePaymentAccount);

router.patch('/:id/status', togglePaymentAccountStatus);
router.patch('/:id/default', setDefaultPaymentAccount);

module.exports = router;
