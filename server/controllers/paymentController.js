const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const { calculatePaymentState, ensureLegacyPayment, syncBillPaymentSummary, attachPaymentSummaries } = require('../utils/paymentSummary');
const { getPagination, paginatedResponse } = require('../utils/pagination');

const paymentMethods = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'];
const paymentStatuses = ['Completed', 'Pending', 'Failed', 'Refunded'];
const validId = value => mongoose.isValidObjectId(value);

const getBillWithSummary = async (billId) => {
  const bill = await Bill.findById(billId).populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber brand model');
  if (!bill) return null;
  const [summary] = await attachPaymentSummaries([bill]);
  return summary;
};

const parseRobustDate = (val) => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      return new Date(year, month, day);
    }
  }
  return new Date(val);
};

const cleanPaymentInput = (body) => {
  const amount = Number(body.amount);
  const paymentDate = parseRobustDate(body.paymentDate);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Payment amount must be greater than zero.' };
  if (body.paymentMethod && !paymentMethods.includes(body.paymentMethod)) return { error: 'Invalid payment method.' };
  if (body.status && !paymentStatuses.includes(body.status)) return { error: 'Invalid payment status.' };
  if (Number.isNaN(paymentDate.getTime())) return { error: 'Invalid payment date.' };
  return {
    value: {
      amount,
      paymentDate,
      paymentMethod: body.paymentMethod || 'Cash',
      status: body.status || 'Completed',
      referenceNumber: String(body.referenceNumber || '').trim(),
      notes: String(body.notes || '').trim()
    }
  };
};

const listPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.bill) {
      if (!validId(req.query.bill)) return res.status(400).json({ message: 'Invalid bill ID' });
      filter.bill = req.query.bill;
    }
    if (req.query.customer) {
      if (!validId(req.query.customer)) return res.status(400).json({ message: 'Invalid customer ID' });
      filter.customer = req.query.customer;
    }

    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const [total, payments] = await Promise.all([
        Payment.countDocuments(filter),
        Payment.find(filter)
          .populate('customer', 'name mobile')
          .populate('bill', 'billNumber totalAmount')
          .sort({ paymentDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
      ]);
      return res.json(paginatedResponse({ data: payments, total, page, limit }));
    }

    const payments = await Payment.find(filter)
      .populate('customer', 'name mobile')
      .populate('bill', 'billNumber totalAmount')
      .sort({ paymentDate: -1, createdAt: -1 });
    res.json(payments);
  } catch (error) {
    console.error('listPayments:', error.message);
    res.status(500).json({ message: 'Unable to load payment history' });
  }
};

const getPaymentsForBill = async (req, res) => {
  if (!validId(req.params.billId)) return res.status(400).json({ message: 'Invalid bill ID' });
  try {
    const bill = await Bill.findById(req.params.billId);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    await ensureLegacyPayment(bill);
    const payments = await Payment.find({ bill: bill._id }).sort({ paymentDate: -1, createdAt: -1 });
    const summary = await getBillWithSummary(bill._id);
    res.json({ bill: summary, payments });
  } catch (error) {
    console.error('getPaymentsForBill:', error.message);
    res.status(500).json({ message: 'Unable to load payment history' });
  }
};

const createPayment = async (req, res) => {
  const { value, error } = cleanPaymentInput(req.body);
  if (error) return res.status(400).json({ message: error });
  if (!validId(req.body.billId)) return res.status(400).json({ message: 'Invalid bill ID' });

  // NOTE: Mongoose session transactions require a MongoDB replica set (works on Atlas, not on standalone local mongod).
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const bill = await Bill.findById(req.body.billId).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Bill not found' });
    }
    if (req.body.customerId) {
      const passedCustId = typeof req.body.customerId === 'object' ? req.body.customerId._id : req.body.customerId;
      const billCustId = typeof bill.customer === 'object' ? bill.customer._id : bill.customer;
      if (String(passedCustId) !== String(billCustId)) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Payment customer must match the bill customer.' });
      }
    }

    await ensureLegacyPayment(bill);

    // Recompute outstanding INSIDE the transaction from the bill total and the sum of completed payments
    const completedPayments = await Payment.aggregate([
      { $match: { bill: bill._id, status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).session(session);
    const completedTotal = completedPayments[0]?.total || 0;
    const outstanding = Math.max(bill.totalAmount - completedTotal, 0);

    if (value.status === 'Completed' && value.amount > outstanding + 0.00001) {
      await session.abortTransaction();
      return res.status(400).json({ message: `Payment exceeds the outstanding balance of ₹${outstanding.toFixed(2)}.` });
    }

    const [payment] = await Payment.create([{ ...value, customer: bill.customer, bill: bill._id }], { session });

    // Sync bill payment summary inside transaction
    const newCompletedTotal = completedTotal + (value.status === 'Completed' ? value.amount : 0);
    const state = calculatePaymentState(bill.totalAmount, newCompletedTotal);
    bill.paidAmount = state.totalPaid;
    bill.status = state.status;
    await bill.save({ session });

    await session.commitTransaction();

    res.status(201).json({ payment, bill: await getBillWithSummary(bill._id) });
  } catch (requestError) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('createPayment:', requestError.message);
    res.status(500).json({ message: 'Unable to save payment' });
  } finally {
    session.endSession();
  }
};

const updatePayment = async (req, res) => {
  if (!validId(req.params.paymentId)) return res.status(400).json({ message: 'Invalid payment ID' });
  const { value, error } = cleanPaymentInput(req.body);
  if (error) return res.status(400).json({ message: error });

  // NOTE: Mongoose session transactions require a MongoDB replica set (works on Atlas, not on standalone local mongod).
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const payment = await Payment.findById(req.params.paymentId).session(session);
    if (!payment) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Payment not found' });
    }
    const bill = await Bill.findById(payment.bill).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Bill not found' });
    }

    await ensureLegacyPayment(bill);

    // Recompute outstanding for other completed payments INSIDE the transaction
    const payments = await Payment.find({ bill: bill._id }).session(session);
    const otherCompletedTotal = payments.reduce((total, item) => {
      if (String(item._id) === String(payment._id)) return total;
      return total + (item.status === 'Completed' ? item.amount : 0);
    }, 0);
    const outstanding = Math.max(bill.totalAmount - otherCompletedTotal, 0);

    if (value.status === 'Completed' && value.amount > outstanding + 0.00001) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'This change would make payments exceed the bill total.' });
    }

    Object.assign(payment, value);
    await payment.save({ session });

    // Sync bill payment summary inside transaction
    const newCompletedTotal = otherCompletedTotal + (value.status === 'Completed' ? value.amount : 0);
    const state = calculatePaymentState(bill.totalAmount, newCompletedTotal);
    bill.paidAmount = state.totalPaid;
    bill.status = state.status;
    await bill.save({ session });

    await session.commitTransaction();

    res.json({ payment, bill: await getBillWithSummary(bill._id) });
  } catch (requestError) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('updatePayment:', requestError.message);
    res.status(500).json({ message: 'Unable to update payment' });
  } finally {
    session.endSession();
  }
};

const deletePayment = async (req, res) => {
  if (!validId(req.params.paymentId)) return res.status(400).json({ message: 'Invalid payment ID' });
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    const billId = payment.bill;
    await payment.deleteOne();
    await syncBillPaymentSummary(billId);
    res.json({ message: 'Payment deleted', bill: await getBillWithSummary(billId) });
  } catch (error) {
    console.error('deletePayment:', error.message);
    res.status(500).json({ message: 'Unable to delete payment' });
  }
};

const getCustomerPayments = async (req, res) => {
  if (!validId(req.params.customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const payments = await Payment.find({ customer: customer._id }).populate('bill', 'billNumber totalAmount').sort({ paymentDate: -1 });
    res.json(payments);
  } catch (error) {
    console.error('getCustomerPayments:', error.message);
    res.status(500).json({ message: 'Unable to load customer payments' });
  }
};

const getOutstandingBills = async (req, res) => {
  try {
    const bills = await Bill.find().populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber brand model').sort({ date: -1, createdAt: -1 });
    let summaries = await attachPaymentSummaries(bills);
    const status = String(req.query.status || 'All').toLowerCase();
    if (status !== 'all') summaries = summaries.filter(bill => status === 'partially paid' || status === 'partial' ? bill.status === 'Partial' : bill.status.toLowerCase() === status);
    const query = String(req.query.search || '').trim().toLowerCase();
    if (query) summaries = summaries.filter(bill => [bill.billNumber, bill.customer?.name, bill.customer?.mobile, bill.vehicle?.vehicleNumber].some(value => String(value || '').toLowerCase().includes(query)));
    res.json(summaries);
  } catch (error) {
    console.error('getOutstandingBills:', error.message);
    res.status(500).json({ message: 'Unable to load outstanding bills' });
  }
};

const getCustomerOutstanding = async (req, res) => {
  if (!validId(req.params.customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const bills = await Bill.find({ customer: customer._id }).populate('vehicle', 'vehicleNumber').sort({ date: -1 });
    const summaries = await attachPaymentSummaries(bills);
    res.json({ customer, totalOutstanding: summaries.reduce((sum, bill) => sum + bill.outstanding, 0), bills: summaries });
  } catch (error) {
    console.error('getCustomerOutstanding:', error.message);
    res.status(500).json({ message: 'Unable to load customer outstanding balance' });
  }
};

const getBillOutstanding = async (req, res) => {
  if (!validId(req.params.billId)) return res.status(400).json({ message: 'Invalid bill ID' });
  try {
    const bill = await getBillWithSummary(req.params.billId);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json(bill);
  } catch (error) {
    console.error('getBillOutstanding:', error.message);
    res.status(500).json({ message: 'Unable to load bill outstanding balance' });
  }
};

const getPaymentsDashboard = async (_req, res) => {
  try {
    const bills = await Bill.find();
    const summaries = await attachPaymentSummaries(bills);
    const dashboard = summaries.reduce((result, bill) => {
      result.totalOutstanding += bill.outstanding;
      result.totalPaid += bill.totalPaid;
      if (bill.status === 'Pending') result.pendingBills += 1;
      if (bill.status === 'Partial') result.partiallyPaidBills += 1;
      if (bill.status === 'Paid') result.fullyPaidBills += 1;
      return result;
    }, { totalOutstanding: 0, totalPaid: 0, pendingBills: 0, partiallyPaidBills: 0, fullyPaidBills: 0 });
    res.json(dashboard);
  } catch (error) {
    console.error('getPaymentsDashboard:', error.message);
    res.status(500).json({ message: 'Unable to load payments dashboard' });
  }
};

const getQrSettings = async (_req, res) => {
  try {
    const settings = await Settings.findOne() || await Settings.create({});
    res.json({ qrCodeUrl: settings.paymentQrCode || '', upiId: settings.upiId || '', paymentInstructions: settings.paymentInstructions || '' });
  } catch (error) {
    console.error('getQrSettings:', error.message);
    res.status(500).json({ message: 'Unable to load payment settings' });
  }
};

const updateQrSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne() || await Settings.create({});
    if (typeof req.body.upiId === 'string') settings.upiId = req.body.upiId.trim();
    if (typeof req.body.paymentInstructions === 'string') settings.paymentInstructions = req.body.paymentInstructions.trim();
    if (req.file) {
      if (settings.paymentQrCode && !settings.paymentQrCode.startsWith('data:')) {
        try {
          const oldFile = path.join(__dirname, '..', 'uploads', 'payment-qr', path.basename(settings.paymentQrCode));
          if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
        } catch (e) {
          console.error('Error removing old QR image:', e.message);
        }
      }
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        settings.paymentQrCode = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuffer.toString('base64')}`;
        fs.unlinkSync(req.file.path);
      } catch (_) {
        settings.paymentQrCode = `/uploads/payment-qr/${req.file.filename}`;
      }
    }
    await settings.save();
    res.json({ qrCodeUrl: settings.paymentQrCode || '', upiId: settings.upiId || '', paymentInstructions: settings.paymentInstructions || '' });
  } catch (error) {
    console.error('updateQrSettings:', error.message);
    res.status(500).json({ message: 'Unable to save payment settings' });
  }
};

const deleteQrCode = async (_req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings?.paymentQrCode) return res.status(404).json({ message: 'No payment QR code found' });
    const filename = path.basename(settings.paymentQrCode);
    const filePath = path.join(__dirname, '..', 'uploads', 'payment-qr', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    settings.paymentQrCode = '';
    await settings.save();
    res.json({ message: 'Payment QR code removed' });
  } catch (error) {
    console.error('deleteQrCode:', error.message);
    res.status(500).json({ message: 'Unable to remove payment QR code' });
  }
};

module.exports = {
  listPayments,
  getPaymentsForBill,
  createPayment,
  updatePayment,
  deletePayment,
  getCustomerPayments,
  getOutstandingBills,
  getCustomerOutstanding,
  getBillOutstanding,
  getPaymentsDashboard,
  getQrSettings,
  updateQrSettings,
  deleteQrCode
};
