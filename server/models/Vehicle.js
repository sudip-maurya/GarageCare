const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  vehicleType: {
    type: String,
    required: true,
    enum: ['2 Wheeler', '4 Wheeler', 'Other']
  },
  brand: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true,
    trim: true
  },
  currentKm: {
    type: Number,
    required: true,
    default: 0
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  insuranceExpiryDate: {
    type: Date
  },
  pucExpiryDate: {
    type: Date
  },
  nextServiceDate: {
    type: Date
  },
  nextOilChangeKm: {
    type: Number
  },
  nextOilChangeDate: {
    type: Date
  },
  lastOilChangeKm: {
    type: Number
  }
}, { timestamps: true });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;
