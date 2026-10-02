const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const PaymentAccount = require('../models/PaymentAccount');
const Counter = require('../models/Counter');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const { attachPaymentSummaries, calculatePaymentState, getCompletedPaymentTotal, syncBillPaymentSummary } = require('../utils/paymentSummary');
const { getPagination, paginatedResponse } = require('../utils/pagination');

// @desc    Get all bills
// @route   GET /api/bills
// @access  Private
const getBills = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const [total, bills] = await Promise.all([
        Bill.countDocuments(),
        Bill.find()
          .populate('customer', 'name mobile')
          .populate('vehicle', 'vehicleNumber brand model')
          .populate('paymentAccount')
          .sort({ date: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
      ]);
      const summaries = await attachPaymentSummaries(bills);
      return res.json(paginatedResponse({ data: summaries, total, page, limit }));
    }
    const bills = await Bill.find()
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('paymentAccount')
      .sort({ date: -1, createdAt: -1 });
    const summaries = await attachPaymentSummaries(bills);
    res.json(summaries);
  } catch (error) {
    console.error('getBills:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get bill by ID
// @route   GET /api/bills/:id
// @access  Private
const getBillById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid bill ID' });
  }

  try {
    const bill = await Bill.findById(req.params.id)
      .populate('customer')
      .populate('vehicle')
      .populate('service')
      .populate('paymentAccount');
    if (bill) {
      const [summary] = await attachPaymentSummaries([bill]);
      res.json(summary);
    } else {
      res.status(404).json({ message: 'Bill not found' });
    }
  } catch (error) {
    console.error('getBillById:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get bills related to a service
// @route   GET /api/bills/service/:serviceId
// @access  Private
const getBillByServiceId = async (req, res) => {
  const { serviceId } = req.params;
  if (!mongoose.isValidObjectId(serviceId)) {
    return res.status(400).json({ message: 'Invalid service ID' });
  }

  try {
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.json([]);
    }

    // Direct relationship or matching vehicle/customer
    const conditions = [{ service: service._id }];
    if (service.vehicle && service.customer) {
      conditions.push({ vehicle: service.vehicle, customer: service.customer });
    } else if (service.vehicle) {
      conditions.push({ vehicle: service.vehicle });
    }

    const bills = await Bill.find({ $or: conditions })
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('service')
      .populate('paymentAccount')
      .sort({ date: -1, createdAt: -1 });

    const summaries = await attachPaymentSummaries(bills);

    // Deduplicate by bill ID
    const uniqueMap = new Map();
    for (const b of summaries) {
      uniqueMap.set(String(b._id), b);
    }
    const uniqueBills = Array.from(uniqueMap.values());

    res.json(uniqueBills);
  } catch (error) {
    console.error('getBillByServiceId:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new bill
// @route   POST /api/bills
// @access  Private
const createBill = async (req, res) => {
  try {
    const {
      customer,
      vehicle,
      date,
      paymentAccount,
      items,
      discount = 0,
      paidAmount = 0
    } = req.body;

    // Validate customer and vehicle IDs
    if (!customer || !mongoose.isValidObjectId(customer)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    if (!vehicle || !mongoose.isValidObjectId(vehicle)) {
      return res.status(400).json({ message: 'Invalid vehicle ID' });
    }

    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one bill item is required' });
    }

    const validTypes = ['Service', 'Part', 'Labour', 'Other'];
    for (const item of items) {
      const desc = String(item.description || item.itemDescription || '').trim();
      const type = item.type;
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || Number(item.amount) || 0;
      const totalPrice = Number(item.totalPrice) || (qty * unitPrice) || Number(item.amount) || 0;
      if (!desc || !type || !validTypes.includes(type) || !Number.isFinite(totalPrice) || totalPrice <= 0) {
        return res.status(400).json({ message: 'Each bill item must have a description, valid type, and positive amount' });
      }
    }

    // Customer & vehicle lookup
    const [customerDoc, vehicleDoc] = await Promise.all([
      Customer.findById(customer),
      Vehicle.findById(vehicle)
    ]);

    if (!customerDoc || !vehicleDoc) {
      return res.status(400).json({ message: 'Customer or vehicle not found in database' });
    }

    // Normalize items
    const normalizedItems = items.map(item => {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || Number(item.amount) || 0;
      const totalPrice = Number(item.totalPrice) || (qty * unitPrice) || Number(item.amount) || 0;
      return {
        description: String(item.description || item.itemDescription || '').trim(),
        itemDescription: String(item.itemDescription || item.description || '').trim(),
        quantity: qty,
        unitPrice,
        totalPrice,
        amount: totalPrice,
        type: item.type
      };
    });

    const subtotal = normalizedItems.reduce((acc, item) => acc + item.amount, 0);
    const numDiscount = Number(discount) || 0;
    if (!Number.isFinite(numDiscount) || numDiscount < 0 || numDiscount > subtotal) {
      return res.status(400).json({ message: 'Discount must be between 0 and the subtotal' });
    }

    const totalAmount = subtotal - numDiscount;
    const numPaidAmount = Number(paidAmount) || 0;
    if (!Number.isFinite(numPaidAmount) || numPaidAmount < 0 || numPaidAmount > totalAmount) {
      return res.status(400).json({ message: 'Paid amount must be between 0 and total amount' });
    }

    let service = req.body.service || req.body.serviceId || null;
    if (service && !mongoose.isValidObjectId(service)) {
      service = null;
    }

    // Auto-link: if not explicitly supplied, check if there's an unbilled service
    if (!service && vehicle && customer) {
      const existingBilledServiceIds = await Bill.distinct('service', {
        service: { $ne: null }
      });

      const unbilledService = await Service.findOne({
        vehicle,
        customer,
        _id: { $nin: existingBilledServiceIds }
      }).sort({ serviceDate: -1, createdAt: -1 });

      if (unbilledService) {
        service = unbilledService._id;
      }
    }

    const billDate = date ? new Date(date) : null;
    if (date && Number.isNaN(billDate.getTime())) {
      return res.status(400).json({ message: 'Invalid bill date' });
    }

    // Get garage settings
    const settings = await Settings.findOne() || {};

    // Resolve payment account snapshot
    let paymentAccountDoc = null;
    if (paymentAccount && mongoose.isValidObjectId(paymentAccount)) {
      paymentAccountDoc = await PaymentAccount.findById(paymentAccount);
    } else {
      paymentAccountDoc = await PaymentAccount.findOne({ isActive: true, isDefault: true })
        || await PaymentAccount.findOne({ isActive: true });
    }

    let paymentAccountDetails = null;
    if (paymentAccountDoc) {
      paymentAccountDetails = {
        name: paymentAccountDoc.name,
        paymentType: paymentAccountDoc.paymentType,
        upiId: paymentAccountDoc.upiId || '',
        qrCodeUrl: paymentAccountDoc.qrCodeUrl || '',
        instructions: paymentAccountDoc.instructions || '',
        bankDetails: paymentAccountDoc.bankDetails || {}
      };
    }

    // Atomic Bill Number generation via Counter
    const currentYear = new Date().getFullYear();
    const c = await Counter.findOneAndUpdate(
      { _id: 'billNumber' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const billNumber = `INV-${currentYear}-${String(c.seq).padStart(4, '0')}`;

    const bill = await Bill.create({
      billNumber,
      customer,
      vehicle,
      date: billDate || Date.now(),
      service,
      items: normalizedItems,
      paymentAccount: paymentAccountDoc ? paymentAccountDoc._id : null,
      paymentAccountDetails,
      garageDetails: {
        name: settings.garageName || 'GarageCare',
        address: settings.garageAddress || '',
        contact: settings.garageContact || ''
      },
      customerDetails: {
        name: customerDoc.name,
        mobile: customerDoc.mobile
      },
      vehicleDetails: {
        vehicleNumber: vehicleDoc.vehicleNumber,
        currentKm: vehicleDoc.currentKm
      },
      discount: numDiscount,
      totalAmount,
      paidAmount: numPaidAmount,
      status: numPaidAmount >= totalAmount && totalAmount > 0 ? 'Paid' : (numPaidAmount > 0 ? 'Partial' : 'Pending')
    });

    if (numPaidAmount > 0) {
      await Payment.create({
        customer: bill.customer,
        bill: bill._id,
        amount: numPaidAmount,
        paymentDate: bill.date || new Date(),
        paymentMethod: 'Cash',
        status: 'Completed',
        notes: 'Initial payment recorded on bill generation.'
      });
    }

    await syncBillPaymentSummary(bill._id);

    const synced = await Bill.findById(bill._id)
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('service')
      .populate('paymentAccount');

    const [summary] = await attachPaymentSummaries([synced]);
    res.status(201).json(summary || synced);
  } catch (error) {
    console.error('createBill:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update an existing bill
// @route   PUT /api/bills/:id
// @access  Private
const updateBill = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid bill ID' });
  }

  const { customer, vehicle, date, items, discount = 0 } = req.body;
  const service = req.body.service !== undefined ? req.body.service : (req.body.serviceId !== undefined ? req.body.serviceId : null);

  if (!mongoose.isValidObjectId(customer) || !mongoose.isValidObjectId(vehicle)) {
    return res.status(400).json({ message: 'A valid customer and vehicle are required' });
  }

  if (service && !mongoose.isValidObjectId(service)) {
    return res.status(400).json({ message: 'Invalid service ID' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one bill item is required' });
  }

  const normalizedItems = items.map(item => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || Number(item.amount) || 0;
    const totalPrice = Number(item.totalPrice) || (qty * unitPrice) || Number(item.amount) || 0;
    return {
      description: String(item.description || item.itemDescription || '').trim(),
      itemDescription: String(item.itemDescription || item.description || '').trim(),
      quantity: qty,
      unitPrice,
      totalPrice,
      amount: totalPrice,
      type: item.type
    };
  });

  const validTypes = ['Service', 'Part', 'Labour', 'Other'];
  if (normalizedItems.some(item => !item.description || !Number.isFinite(item.amount) || item.amount <= 0 || !validTypes.includes(item.type))) {
    return res.status(400).json({ message: 'Each bill item needs a description, valid type, and positive amount' });
  }

  const numericDiscount = Number(discount);
  if (!Number.isFinite(numericDiscount) || numericDiscount < 0) {
    return res.status(400).json({ message: 'Discount cannot be negative' });
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
  if (numericDiscount > subtotal) {
    return res.status(400).json({ message: 'Discount cannot exceed subtotal' });
  }

  const totalAmount = subtotal - numericDiscount;

  const billDate = date ? new Date(date) : null;
  if (date && Number.isNaN(billDate.getTime())) {
    return res.status(400).json({ message: 'Invalid bill date' });
  }

  try {
    const [bill, customerDoc, vehicleDoc, serviceDoc] = await Promise.all([
      Bill.findById(id),
      Customer.findById(customer),
      Vehicle.findById(vehicle),
      service ? Service.findById(service) : Promise.resolve(null)
    ]);

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    if (!customerDoc || !vehicleDoc) {
      return res.status(404).json({ message: 'Customer or vehicle not found' });
    }
    if (vehicleDoc.customer.toString() !== customerDoc._id.toString()) {
      return res.status(400).json({ message: 'The selected vehicle does not belong to this customer' });
    }
    if (service && !serviceDoc) {
      return res.status(404).json({ message: 'Service not found' });
    }
    if (serviceDoc && (serviceDoc.customer.toString() !== customerDoc._id.toString() || serviceDoc.vehicle.toString() !== vehicleDoc._id.toString())) {
      return res.status(400).json({ message: 'The selected service does not match this customer and vehicle' });
    }

    // Compare desired paid amount against completed-Payment total BEFORE saving
    // Ignore req.body.paidAmount/status as direct writes
    const completedTotal = await getCompletedPaymentTotal(bill._id);

    let desiredPaid = completedTotal;
    if (req.body.paidAmount !== undefined) {
      const rawPaid = Number(req.body.paidAmount);
      desiredPaid = Math.min(Math.max(Number.isFinite(rawPaid) ? rawPaid : 0, 0), totalAmount);
    } else if (req.body.status === 'Paid') {
      desiredPaid = totalAmount;
    }

    if (desiredPaid < completedTotal) {
      return res.status(400).json({ message: 'Reduce the paid amount from the Payments page instead.' });
    }

    bill.customer = customerDoc._id;
    bill.vehicle = vehicleDoc._id;
    bill.service = serviceDoc ? serviceDoc._id : null;
    bill.date = billDate || bill.date;
    bill.items = normalizedItems;
    bill.discount = numericDiscount;
    bill.totalAmount = totalAmount;
    bill.customerDetails = { name: customerDoc.name, mobile: customerDoc.mobile };
    bill.vehicleDetails = { vehicleNumber: vehicleDoc.vehicleNumber, currentKm: vehicleDoc.currentKm };

    if (req.body.paymentAccount !== undefined) {
      if (req.body.paymentAccount && mongoose.isValidObjectId(req.body.paymentAccount)) {
        const paymentAccountDoc = await PaymentAccount.findById(req.body.paymentAccount);
        if (paymentAccountDoc) {
          bill.paymentAccount = paymentAccountDoc._id;
          bill.paymentAccountDetails = {
            name: paymentAccountDoc.name,
            paymentType: paymentAccountDoc.paymentType,
            upiId: paymentAccountDoc.upiId || '',
            qrCodeUrl: paymentAccountDoc.qrCodeUrl || '',
            instructions: paymentAccountDoc.instructions || '',
            bankDetails: paymentAccountDoc.bankDetails || {}
          };
        }
      } else if (!req.body.paymentAccount) {
        bill.paymentAccount = null;
        bill.paymentAccountDetails = null;
      }
    }

    await bill.save();

    // If desired > completed total -> after save, Payment.create the difference
    const diff = desiredPaid - completedTotal;
    if (diff > 0) {
      await Payment.create({
        customer: bill.customer,
        bill: bill._id,
        amount: diff,
        paymentDate: new Date(),
        paymentMethod: 'Other',
        status: 'Completed',
        notes: 'Adjusted during bill edit'
      });
    }

    // Always finish with syncBillPaymentSummary(bill._id) and return the synced bill
    await syncBillPaymentSummary(bill._id);

    const updatedBill = await Bill.findById(bill._id)
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('service')
      .populate('paymentAccount');

    const [summary] = await attachPaymentSummaries([updatedBill]);
    res.json(summary || updatedBill);
  } catch (error) {
    console.error('updateBill:', error.message);
    res.status(500).json({ message: 'Unable to update bill' });
  }
};

// @desc    Update a bill payment status
// @route   PATCH /api/bills/:id/status
// @access  Private
const updateBillStatus = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid bill ID' });
  }

  const { status } = req.body;
  if (!['Pending', 'Paid'].includes(status)) {
    return res.status(400).json({ message: 'Payment status must be Pending or Paid' });
  }

  try {
    const bill = await Bill.findById(id);

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    if (status === 'Paid') {
      const paid = await getCompletedPaymentTotal(bill._id);
      const remaining = bill.totalAmount - paid;
      if (remaining > 0) {
        await Payment.create({
          customer: bill.customer,
          bill: bill._id,
          amount: remaining,
          paymentDate: new Date(),
          paymentMethod: 'Other',
          status: 'Completed',
          notes: 'Marked as Paid from bills list.'
        });
      }
      await syncBillPaymentSummary(bill._id);
    } else if (status === 'Pending') {
      await Payment.deleteMany({ bill: bill._id });
      bill.status = 'Pending';
      bill.paidAmount = 0;
      await bill.save();
    }

    const [summary] = await attachPaymentSummaries([await Bill.findById(id).populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber brand model')]);
    res.json(summary);
  } catch (error) {
    console.error('updateBillStatus:', error.message);
    res.status(500).json({ message: 'Unable to update payment status' });
  }
};

// @desc    Delete a bill — only allowed once the bill is fully paid
// @route   DELETE /api/bills/:id
// @access  Private
const deleteBill = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid bill ID' });
  }

  try {
    const bill = await Bill.findById(id);

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Never delete a bill that still has an outstanding amount
    const paid = await getCompletedPaymentTotal(bill._id);
    const { outstanding, status } = calculatePaymentState(bill.totalAmount, paid);

    if (outstanding > 0 || status !== 'Paid') {
      return res.status(400).json({ message: 'Bill cannot be deleted until it is fully paid.' });
    }

    // Remove the bill's payment ledger rows so no orphaned payments remain
    await Payment.deleteMany({ bill: bill._id });
    await bill.deleteOne();

    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('deleteBill:', error.message);
    res.status(500).json({ message: 'Unable to delete bill' });
  }
};

module.exports = {
  getBills,
  getBillById,
  getBillByServiceId,
  getBillsByServiceId: getBillByServiceId,
  createBill,
  updateBill,
  updateBillStatus,
  deleteBill
};
