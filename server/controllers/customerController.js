const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { getPagination, paginatedResponse } = require('../utils/pagination');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const [total, customers] = await Promise.all([
        Customer.countDocuments(),
        Customer.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      return res.json(paginatedResponse({ data: customers, total, page, limit }));
    }
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    console.error('getCustomers:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }

  try {
    const customer = await Customer.findById(req.params.id);
    if (customer) {
      // Get associated vehicles
      const vehicles = await Vehicle.find({ customer: customer._id });
      res.json({ ...customer.toObject(), vehicles });
    } else {
      res.status(404).json({ message: 'Customer not found' });
    }
  } catch (error) {
    console.error('getCustomerById:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  try {
    const { name, mobile } = req.body;

    if (!mobile || !String(mobile).trim()) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    const trimmedMobile = String(mobile).trim();
    
    // Check if customer with mobile exists
    const customerExists = await Customer.findOne({ mobile: trimmedMobile });
    if (customerExists) {
      return res.status(400).json({ message: 'Customer with this mobile already exists' });
    }

    const customer = await Customer.create({
      name: String(name || '').trim(),
      mobile: trimmedMobile
    });

    res.status(201).json(customer);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Customer with this mobile already exists' });
    }
    console.error('createCustomer:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
const updateCustomer = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }

  try {
    const { name, mobile } = req.body;

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (mobile !== undefined) {
      const trimmedMobile = String(mobile).trim();
      if (!trimmedMobile) {
        return res.status(400).json({ message: 'Mobile number cannot be empty' });
      }
      const existing = await Customer.findOne({
        mobile: trimmedMobile,
        _id: { $ne: customer._id }
      });
      if (existing) {
        return res.status(400).json({ message: 'Customer with this mobile already exists' });
      }
      customer.mobile = trimmedMobile;
    }

    if (name !== undefined) {
      customer.name = String(name).trim() || customer.name;
    }

    const updatedCustomer = await customer.save();
    res.json(updatedCustomer);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Customer with this mobile already exists' });
    }
    console.error('updateCustomer:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
const deleteCustomer = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }

  try {
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      const customerVehicles = await Vehicle.find({ customer: customer._id }).select('_id');
      const vehicleIds = customerVehicles.map(v => v._id);

      await Promise.all([
        Customer.deleteOne({ _id: customer._id }),
        Vehicle.deleteMany({ customer: customer._id }),
        Service.deleteMany({ $or: [{ customer: customer._id }, { vehicle: { $in: vehicleIds } }] }),
        Bill.deleteMany({ customer: customer._id }),
        Payment.deleteMany({ customer: customer._id }),
        Reminder.deleteMany({ $or: [{ customer: customer._id }, { vehicle: { $in: vehicleIds } }] })
      ]);

      res.json({ message: 'Customer and all associated records removed' });
    } else {
      res.status(404).json({ message: 'Customer not found' });
    }
  } catch (error) {
    console.error('deleteCustomer:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
