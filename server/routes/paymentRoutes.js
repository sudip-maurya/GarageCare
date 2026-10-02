const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const uploadQr = require('../middleware/qrUpload');
const {
  listPayments, getPaymentsForBill, createPayment, updatePayment, deletePayment,
  getCustomerPayments, getOutstandingBills, getCustomerOutstanding, getBillOutstanding,
  getPaymentsDashboard, getQrSettings, updateQrSettings, deleteQrCode
} = require('../controllers/paymentController');

router.use(protect);
router.get('/dashboard', getPaymentsDashboard);
router.get('/outstanding', getOutstandingBills);
router.get('/outstanding/customer/:customerId', getCustomerOutstanding);
router.get('/outstanding/bill/:billId', getBillOutstanding);
router.get('/customer/:customerId', getCustomerPayments);
router.get('/bill/:billId', getPaymentsForBill);
router.get('/qr', getQrSettings);
router.put('/qr', uploadQr.single('qrCode'), updateQrSettings);
router.delete('/qr', deleteQrCode);
router.route('/').get(listPayments).post(createPayment);
router.route('/:paymentId').put(updatePayment).delete(deletePayment);

module.exports = router;
