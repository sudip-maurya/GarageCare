const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  serviceDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  vehicleKm: {
    type: Number
  },
  workPerformed: {
    type: String
  },
  partsChanged: {
    type: String
  },
  oilChanged: {
    type: Boolean,
    default: false
  },
  serviceAmount: {
    type: Number
  },
  nextServiceDate: {
    type: Date
  },
  notes: {
    type: String
  }
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);
module.exports = Service;
