const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  garageName: {
    type: String,
    default: 'My Garage'
  },
  garageAddress: {
    type: String,
    default: ''
  },
  garageContact: {
    type: String,
    default: ''
  },
  garageLogo: {
    type: String, // URL or base64
    default: ''
  },
  agentName: {
    type: String,
    default: ''
  },
  agentPhone: {
    type: String,
    default: ''
  },
  agentWhatsApp: {
    type: String,
    default: ''
  },
  paymentQrCode: {
    type: String,
    default: ''
  },
  upiId: {
    type: String,
    default: ''
  },
  paymentInstructions: {
    type: String,
    default: ''
  },
  reminders: {
    service: {
      type: [Number], // days before
      default: [15, 7, 3]
    },
    insurance: {
      type: [Number], // days before
      default: [30, 15, 7, 3]
    },
    puc: {
      type: [Number], // days before
      default: [15, 7, 3]
    },
    oilChange: {
      type: [Number], // km before
      default: [500, 100]
    }
  }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;

