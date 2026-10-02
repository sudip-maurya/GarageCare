const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const mongoose = require('mongoose');
const { getPagination, paginatedResponse } = require('../utils/pagination');

// @desc    Get all services
// @route   GET /api/services
// @access  Private
const getServices = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const [total, services] = await Promise.all([
        Service.countDocuments(),
        Service.find()
          .populate('vehicle', 'vehicleNumber brand model')
          .populate('customer', 'name mobile')
          .sort({ serviceDate: -1 })
          .skip(skip)
          .limit(limit)
      ]);
      return res.json(paginatedResponse({ data: services, total, page, limit }));
    }
    const services = await Service.find()
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('customer', 'name mobile')
      .sort({ serviceDate: -1 });
    res.json(services);
  } catch (error) {
    console.error('getServices:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get service by ID
// @route   GET /api/services/:id
// @access  Private
const getServiceById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid service ID' });
  }

  try {
    const service = await Service.findById(req.params.id)
      .populate('vehicle')
      .populate('customer');
    if (service) {
      res.json(service);
    } else {
      res.status(404).json({ message: 'Service not found' });
    }
  } catch (error) {
    console.error('getServiceById:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get services by vehicle
// @route   GET /api/services/vehicle/:vehicleId
// @access  Private
const getServicesByVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    if (!mongoose.isValidObjectId(vehicleId)) {
      return res.status(400).json({ message: 'Invalid vehicle ID' });
    }

    const services = await Service.find({ vehicle: vehicleId })
      .populate('vehicle', 'vehicleNumber brand model')
      .populate('customer', 'name mobile')
      .sort({ serviceDate: -1, createdAt: -1 });

    res.json(services);
  } catch (error) {
    console.error('getServicesByVehicle:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create new service
// @route   POST /api/services
// @access  Private
const createService = async (req, res) => {
  try {
    const {
      vehicle,
      customer,
      serviceDate,
      vehicleKm,
      workPerformed,
      partsChanged,
      oilChanged,
      serviceAmount,
      nextServiceDate,
      nextOilChangeKm, // To update vehicle
      notes
    } = req.body;

    // The service must always be connected to an existing Vehicle record.
    if (!vehicle || !mongoose.isValidObjectId(vehicle)) {
      return res.status(400).json({ message: 'Please select a customer and vehicle.' });
    }

    const vehicleDoc = await Vehicle.findById(vehicle).populate('customer', 'name');
    if (!vehicleDoc) {
      return res.status(400).json({ message: 'Selected vehicle was not found. Please select a valid vehicle.' });
    }
    if (!vehicleDoc.customer) {
      return res.status(400).json({ message: 'Selected vehicle does not have a customer. Please choose another vehicle.' });
    }

    // Always use the customer connected to the selected vehicle.
    const customerId = (customer && mongoose.isValidObjectId(customer) && String(customer) === String(vehicleDoc.customer._id))
      ? customer
      : vehicleDoc.customer._id;

    const service = await Service.create({
      vehicle: vehicleDoc._id,
      customer: customerId,
      serviceDate: serviceDate || Date.now(),
      vehicleKm: vehicleKm || vehicleDoc.currentKm || 0,
      workPerformed: workPerformed || '',
      partsChanged,
      oilChanged,
      serviceAmount: serviceAmount || 0,
      nextServiceDate,
      notes
    });

    // Update vehicle's next service dates (KM fields are only touched when provided).
    if (vehicleKm && vehicleKm > vehicleDoc.currentKm) {
      vehicleDoc.currentKm = vehicleKm;
    }
    if (nextServiceDate) {
      vehicleDoc.nextServiceDate = nextServiceDate;
    }
    if (oilChanged) {
      vehicleDoc.lastOilChangeKm = vehicleKm || vehicleDoc.currentKm;
      if (nextOilChangeKm) {
        vehicleDoc.nextOilChangeKm = nextOilChangeKm;
      }
    }
    if (vehicleKm || nextServiceDate || oilChanged) {
      await vehicleDoc.save();
    }

    res.status(201).json(service);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    console.error('createService:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private
const updateService = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid service ID' });
  }

  try {
    const service = await Service.findById(req.params.id);

    if (service) {
      service.serviceDate = req.body.serviceDate || service.serviceDate;
      service.vehicleKm = req.body.vehicleKm || service.vehicleKm;
      service.workPerformed = req.body.workPerformed || service.workPerformed;
      service.partsChanged = req.body.partsChanged || service.partsChanged;
      service.oilChanged = req.body.oilChanged !== undefined ? req.body.oilChanged : service.oilChanged;
      service.serviceAmount = req.body.serviceAmount || service.serviceAmount;
      service.nextServiceDate = req.body.nextServiceDate || service.nextServiceDate;
      service.notes = req.body.notes || service.notes;

      const updatedService = await service.save();
      res.json(updatedService);
    } else {
      res.status(404).json({ message: 'Service not found' });
    }
  } catch (error) {
    console.error('updateService:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private
const deleteService = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid service ID' });
  }

  try {
    const service = await Service.findById(req.params.id);

    if (service) {
      await Service.deleteOne({ _id: service._id });
      res.json({ message: 'Service removed' });
    } else {
      res.status(404).json({ message: 'Service not found' });
    }
  } catch (error) {
    console.error('deleteService:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getServices,
  getServiceById,
  getServicesByVehicle,
  createService,
  updateService,
  deleteService
};
