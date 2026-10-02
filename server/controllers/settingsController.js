const Settings = require('../models/Settings');
const InsuranceAgent = require('../models/InsuranceAgent');

const phonePattern = /^\+?[0-9][0-9\s-]{6,24}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateInsuranceAgent = (body) => {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const whatsapp = String(body.whatsapp || '').trim();
  const companyName = String(body.companyName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (!name) return { message: 'Agent name is required.' };
  if (!phonePattern.test(phone)) return { message: 'Enter a valid agent phone number.' };
  if (whatsapp && !phonePattern.test(whatsapp)) return { message: 'Enter a valid WhatsApp number.' };
  if (email && !emailPattern.test(email)) return { message: 'Enter a valid agent email address.' };
  return { value: { name, phone, whatsapp, companyName, email } };
};

// @desc    Get garage settings
// @route   GET /api/settings
// @access  Private
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        garageName: 'GarageCare Auto Workshop',
        garageAddress: '123 Service Road, Auto Zone',
        garageContact: '+91 9876543210',
        agentName: 'Owner',
        agentPhone: '',
        agentWhatsApp: '',
        reminders: {
          service: [15, 7, 3],
          insurance: [30, 15, 7, 3],
          puc: [15, 7, 3],
          oilChange: [500, 100]
        }
      });
    }
    res.json(settings);
  } catch (error) {
    console.error('getSettings:', error.message);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
};

// @desc    Update garage settings
// @route   PUT /api/settings
// @access  Private
const updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    const {
      garageName,
      garageAddress,
      garageContact,
      garageLogo,
      agentName,
      agentPhone,
      agentWhatsApp,
      paymentInstructions,
      reminders
    } = req.body;

    if (garageName !== undefined) settings.garageName = garageName;
    if (garageAddress !== undefined) settings.garageAddress = garageAddress;
    if (garageContact !== undefined) settings.garageContact = garageContact;
    if (garageLogo !== undefined) settings.garageLogo = garageLogo;
    if (agentName !== undefined) settings.agentName = agentName;
    if (agentPhone !== undefined) settings.agentPhone = agentPhone;
    if (agentWhatsApp !== undefined) settings.agentWhatsApp = agentWhatsApp;
    if (paymentInstructions !== undefined) settings.paymentInstructions = paymentInstructions;
    if (reminders !== undefined) {
      settings.reminders = {
        ...settings.reminders,
        ...reminders
      };
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    console.error('updateSettings:', error.message);
    res.status(500).json({ message: 'Failed to update settings' });
  }
};


// @desc    Get the authenticated owner's insurance agent
// @route   GET /api/settings/insurance-agent
// @access  Private
const getInsuranceAgent = async (req, res) => {
  try {
    const agent = await InsuranceAgent.findOne({ owner: req.owner._id });
    res.json(agent);
  } catch (error) {
    console.error('getInsuranceAgent:', error.message);
    res.status(500).json({ message: 'Failed to fetch insurance agent details.' });
  }
};

// @desc    Create or update the authenticated owner's insurance agent
// @route   PUT /api/settings/insurance-agent
// @access  Private
const saveInsuranceAgent = async (req, res) => {
  const { value, message } = validateInsuranceAgent(req.body);
  if (message) return res.status(400).json({ message });

  try {
    const agent = await InsuranceAgent.findOneAndUpdate(
      { owner: req.owner._id },
      { $set: value, $setOnInsert: { owner: req.owner._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json(agent);
  } catch (error) {
    console.error('saveInsuranceAgent:', error.message);
    res.status(500).json({ message: 'Failed to save insurance agent details.' });
  }
};
module.exports = {
  getSettings,
  updateSettings,
  getInsuranceAgent,
  saveInsuranceAgent
};
