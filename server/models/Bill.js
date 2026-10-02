const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  garageDetails: {
    name: String,
    address: String,
    contact: String
  },
  customerDetails: {
    name: String,
    mobile: String
  },
  vehicleDetails: {
    vehicleNumber: String,
    currentKm: Number
  },
  paymentAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentAccount'
  },
  paymentAccountDetails: {
    name: String,
    paymentType: String,
    upiId: String,
    qrCodeUrl: String,
    instructions: String,
    bankDetails: {
      accountNumber: String,
      ifscCode: String,
      bankName: String,
      accountHolderName: String
    }
  },
  items: [{
    description: String,
    itemDescription: String,
    quantity: {
      type: Number,
      default: 1
    },
    unitPrice: Number,
    totalPrice: Number,
    amount: Number,
    type: {
      type: String,
      enum: ['Service', 'Part', 'Labour', 'Other'],
      default: 'Service'
    }
  }],
  discount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Paid', 'Partial', 'Partially Paid', 'Pending'],
    default: 'Pending'
  }
}, { timestamps: true });

const Bill = mongoose.model('Bill', billSchema);
module.exports = Bill;
