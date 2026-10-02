const mongoose = require('mongoose');

const paymentAccountSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  paymentType: {
    type: String,
    required: true,
    enum: ['Google Pay', 'PhonePe', 'Paytm', 'UPI', 'Bank Transfer', 'Other'],
    default: 'UPI'
  },
  upiId: {
    type: String,
    trim: true,
    default: ''
  },
  qrCodeUrl: {
    type: String,
    default: ''
  },
  instructions: {
    type: String,
    trim: true,
    default: ''
  },
  bankDetails: {
    accountNumber: { type: String, trim: true, default: '' },
    ifscCode: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    accountHolderName: { type: String, trim: true, default: '' }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

paymentAccountSchema.index({ owner: 1, createdAt: 1 });

module.exports = mongoose.model('PaymentAccount', paymentAccountSchema);
