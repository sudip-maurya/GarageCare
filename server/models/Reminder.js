const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['Service', 'Insurance', 'PUC', 'Payment'],
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Sent', 'Dismissed', 'Completed'],
    default: 'Pending'
  },
  dismissedReason: {
    type: String,
    default: ''
  },
  lastSentAt: {
    type: Date
  },
  notes: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

reminderSchema.index({ vehicle: 1, type: 1, dueDate: 1 });

const Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = Reminder;
