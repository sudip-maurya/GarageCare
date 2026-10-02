const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const Service = require('../models/Service');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { getPagination, paginatedResponse } = require('../utils/pagination');

// @desc    Get all vehicles
// @route   GET /api/vehicles
// @access  Private
const getVehicles = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const [total, vehicles] = await Promise.all([
        Vehicle.countDocuments(),
        Vehicle.find().populate('customer', 'name mobile').sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      return res.json(paginatedResponse({ data: vehicles, total, page, limit }));
    }
    const vehicles = await Vehicle.find().populate('customer', 'name mobile').sort({ createdAt: -1 });
    res.json(vehicles);
  } catch (error) {
    console.error('getVehicles:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single vehicle
// @route   GET /api/vehicles/:id
// @access  Private
const getVehicleById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid vehicle ID' });
  }

  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('customer');
    if (vehicle) {
      res.json(vehicle);
    } else {
      res.status(404).json({ message: 'Vehicle not found' });
    }
  } catch (error) {
    console.error('getVehicleById:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search vehicle by number or customer name
// @route   GET /api/vehicles/search/:query
// @access  Private
const searchVehicle = async (req, res) => {
  try {
    const query = (req.params.query || '').trim();
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Escape regex special characters for safe usage.
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search by vehicle number (partial match, case-insensitive, spaces ignored).
    const vehicleNumberQuery = escapeRegex(query.replace(/\s+/g, ''));
    const vehicleNumberMatch = await Vehicle.find({
      vehicleNumber: { $regex: new RegExp(vehicleNumberQuery, 'i') }
    }).populate('customer', 'name mobile').sort({ createdAt: -1 });

    if (vehicleNumberMatch && vehicleNumberMatch.length > 0) {
      return res.json(vehicleNumberMatch);
    }

    // Search by customer name (partial, case-insensitive) across each customer's vehicles.
    const customers = await Customer.find({ name: { $regex: new RegExp(escapeRegex(query), 'i') } }).select('_id');
    const customerIds = customers.map(customer => customer._id);
    let customerNameMatch = [];
    if (customerIds.length > 0) {
      customerNameMatch = await Vehicle.find({ customer: { $in: customerIds } })
        .populate('customer', 'name mobile')
        .sort({ createdAt: -1 });
    }

    if (customerNameMatch && customerNameMatch.length > 0) {
      return res.json(customerNameMatch);
    }

    return res.json([]);
  } catch (error) {
    console.error('searchVehicle:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new vehicle
// @route   POST /api/vehicles
// @access  Private
const createVehicle = async (req, res) => {
  try {
    const {
      vehicleNumber,
      vehicleType,
      brand,
      model,
      currentKm,
      customer, // customer ID
      insuranceExpiryDate,
      pucExpiryDate,
      nextServiceDate,
      nextOilChangeKm,
      nextOilChangeDate
    } = req.body;

    const formattedVehicleNumber = vehicleNumber.toUpperCase().replace(/\s+/g, '');

    // Check if vehicle exists
    const vehicleExists = await Vehicle.findOne({ vehicleNumber: formattedVehicleNumber });
    if (vehicleExists) {
      return res.status(400).json({ message: 'Vehicle already exists' });
    }

    const vehicle = await Vehicle.create({
      vehicleNumber: formattedVehicleNumber,
      vehicleType,
      brand,
      model,
      currentKm,
      customer,
      insuranceExpiryDate,
      pucExpiryDate,
      nextServiceDate,
      nextOilChangeKm,
      nextOilChangeDate
    });

    res.status(201).json(vehicle);
  } catch (error) {
    console.error('createVehicle:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update vehicle
// @route   PUT /api/vehicles/:id
// @access  Private
const updateVehicle = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid vehicle ID' });
  }

  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (vehicle) {
      vehicle.vehicleNumber = req.body.vehicleNumber ? req.body.vehicleNumber.toUpperCase().replace(/\s+/g, '') : vehicle.vehicleNumber;
      vehicle.vehicleType = req.body.vehicleType || vehicle.vehicleType;
      vehicle.brand = req.body.brand || vehicle.brand;
      vehicle.model = req.body.model || vehicle.model;
      vehicle.currentKm = req.body.currentKm !== undefined ? req.body.currentKm : vehicle.currentKm;
      vehicle.insuranceExpiryDate = req.body.insuranceExpiryDate || vehicle.insuranceExpiryDate;
      vehicle.pucExpiryDate = req.body.pucExpiryDate || vehicle.pucExpiryDate;
      vehicle.nextServiceDate = req.body.nextServiceDate || vehicle.nextServiceDate;
      vehicle.nextOilChangeKm = req.body.nextOilChangeKm || vehicle.nextOilChangeKm;
      vehicle.nextOilChangeDate = req.body.nextOilChangeDate || vehicle.nextOilChangeDate;
      
      if (req.body.customer) {
        vehicle.customer = req.body.customer;
      }

      const updatedVehicle = await vehicle.save();
      res.json(updatedVehicle);
    } else {
      res.status(404).json({ message: 'Vehicle not found' });
    }
  } catch (error) {
    console.error('updateVehicle:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete vehicle
// @route   DELETE /api/vehicles/:id
// @access  Private
const deleteVehicle = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid vehicle ID' });
  }

  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (vehicle) {
      const vehicleBills = await Bill.find({ vehicle: vehicle._id }).select('_id');
      const billIds = vehicleBills.map(b => b._id);

      await Promise.all([
        Vehicle.deleteOne({ _id: vehicle._id }),
        Payment.deleteMany({ bill: { $in: billIds } }),
        Service.deleteMany({ vehicle: vehicle._id }),
        Bill.deleteMany({ vehicle: vehicle._id }),
        Reminder.deleteMany({ vehicle: vehicle._id })
      ]);
      res.json({ message: 'Vehicle and associated records removed' });
    } else {
      res.status(404).json({ message: 'Vehicle not found' });
    }
  } catch (error) {
    console.error('deleteVehicle:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getVehicles,
  getVehicleById,
  searchVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle
};
