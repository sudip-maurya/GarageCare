/**
 * ============================================================================
 * ⚠ SIRF DEMO DATABASE PAR CHALAO — REAL/PRODUCTION PAR KABHI NAHI ⚠
 * ============================================================================
 * GarageCare Demo Data Seed & Cleanup Utility
 * 
 * Generates 15 comprehensive, realistic demo records:
 * - 15 Customers
 * - 15 Vehicles (with diverse overdue, due today, upcoming reminder dates)
 * - 15 Bills (with realistic line items, spread across Sept & Oct 2026)
 * - 10 Completed Payment Records
 * - 15 Service History Logs
 * - Dynamic Reminders (Payment, Service, Insurance, PUC)
 * 
 * Usage:
 *   node server/seed-demo.js          -> Seed 15 demo records
 *   node server/seed-demo.js --clean  -> Clean only demo documents recorded in demo-seed.json
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Customer = require('./models/Customer');
const Vehicle = require('./models/Vehicle');
const Bill = require('./models/Bill');
const Payment = require('./models/Payment');
const Service = require('./models/Service');
const Reminder = require('./models/Reminder');
const Counter = require('./models/Counter');
const Settings = require('./models/Settings');
const PaymentAccount = require('./models/PaymentAccount');

const { syncBillPaymentSummary } = require('./utils/paymentSummary');
const { syncServiceForBill } = require('./utils/serviceSync');
const { syncVehicleAndBillReminders } = require('./controllers/reminderController');

const MANIFEST_PATH = path.join(__dirname, 'demo-seed.json');

// Strict Demo Identifiers for 15 records
const DEMO_PHONES = [
  '9000000001', '9000000002', '9000000003', '9000000004', '9000000005',
  '9000000006', '9000000007', '9000000008', '9000000009', '9000000010',
  '9000000011', '9000000012', '9000000013', '9000000014', '9000000015'
];

const DEMO_VEHICLES = [
  'MH02AB1234', 'MH02CD5678', 'MH03GH3456', 'MH04IJ7890', 'MH05MN6789',
  'MH02OP1122', 'MH03QR3344', 'MH01ST5566', 'MH04UV7788', 'MH02WX9900',
  'MH05YZ1234', 'MH03AA5678', 'MH01BB9012', 'MH01EF9012', 'MH04KL2345'
];

/**
 * Connect to MongoDB database with strict DEMO check
 */
async function connectToDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI missing in server/.env');
    process.exit(1);
  }

  // STRICT SAFETY GUARD: ONLY ALLOW SEEDING ON DEMO DATABASE
  if (!uri.toLowerCase().includes('demo') && !uri.toLowerCase().includes('garagecare-demo')) {
    console.error('⛔ FATAL SAFETY ERROR: MONGO_URI does NOT point to a DEMO database!');
    console.error(`Attempted URI: ${uri}`);
    console.error('Seeding is strictly forbidden on production/real databases.');
    process.exit(1);
  }

  console.log('------------------------------------------------------------');
  console.log('🛡️  DEMO DATABASE VERIFIED: garagecare-demo');
  console.log(`Connecting to: ${uri.replace(/:([^@]+)@/, ':****@')}`);
  console.log('------------------------------------------------------------');

  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB (Demo Cluster)\n');
}

/**
 * Clean previously seeded demo data safely using demo-seed.json
 */
async function cleanDemoData() {
  console.log('🧹 [CLEANUP] Starting Demo Data Cleanup...');

  let manifest = {
    customerIds: [],
    vehicleIds: [],
    billIds: [],
    paymentIds: [],
    serviceIds: [],
    reminderIds: []
  };

  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
      manifest = JSON.parse(raw);
      console.log(`✓ Read existing demo-seed.json (Seeded at: ${manifest.seededAt || 'unknown'})`);
    } catch (e) {
      console.warn('⚠ Could not parse demo-seed.json, falling back to demo identifiers.');
    }
  } else {
    console.log('ℹ No demo-seed.json file found. Checking for existing demo identifiers directly...');
  }

  // Find demo customers by ID or known demo phones
  const demoCustomers = await Customer.find({
    $or: [
      { _id: { $in: manifest.customerIds || [] } },
      { mobile: { $in: DEMO_PHONES } }
    ]
  });
  const customerIds = Array.from(new Set([
    ...(manifest.customerIds || []),
    ...demoCustomers.map(c => c._id.toString())
  ]));

  // Find demo vehicles by ID, known demo plates, or belonging to demo customers
  const demoVehicles = await Vehicle.find({
    $or: [
      { _id: { $in: manifest.vehicleIds || [] } },
      { vehicleNumber: { $in: DEMO_VEHICLES } },
      { customer: { $in: customerIds } }
    ]
  });
  const vehicleIds = Array.from(new Set([
    ...(manifest.vehicleIds || []),
    ...demoVehicles.map(v => v._id.toString())
  ]));

  // Find demo bills
  const demoBills = await Bill.find({
    $or: [
      { _id: { $in: manifest.billIds || [] } },
      { customer: { $in: customerIds } },
      { vehicle: { $in: vehicleIds } }
    ]
  });
  const billIds = Array.from(new Set([
    ...(manifest.billIds || []),
    ...demoBills.map(b => b._id.toString())
  ]));

  // 1. Delete Reminders
  const reminderResult = await Reminder.deleteMany({
    $or: [
      { _id: { $in: manifest.reminderIds || [] } },
      { customer: { $in: customerIds } },
      { vehicle: { $in: vehicleIds } },
      { 'metadata.billId': { $in: billIds } }
    ]
  });
  console.log(`  ✓ Reminders deleted: ${reminderResult.deletedCount}`);

  // 2. Delete Payments
  const paymentResult = await Payment.deleteMany({
    $or: [
      { _id: { $in: manifest.paymentIds || [] } },
      { customer: { $in: customerIds } },
      { bill: { $in: billIds } }
    ]
  });
  console.log(`  ✓ Payments deleted: ${paymentResult.deletedCount}`);

  // 3. Delete Services
  const serviceResult = await Service.deleteMany({
    $or: [
      { _id: { $in: manifest.serviceIds || [] } },
      { customer: { $in: customerIds } },
      { vehicle: { $in: vehicleIds } }
    ]
  });
  console.log(`  ✓ Services deleted: ${serviceResult.deletedCount}`);

  // 4. Delete Bills
  const billResult = await Bill.deleteMany({
    $or: [
      { _id: { $in: manifest.billIds || [] } },
      { customer: { $in: customerIds } },
      { vehicle: { $in: vehicleIds } }
    ]
  });
  console.log(`  ✓ Bills deleted: ${billResult.deletedCount}`);

  // 5. Delete Vehicles
  const vehicleResult = await Vehicle.deleteMany({
    $or: [
      { _id: { $in: manifest.vehicleIds || [] } },
      { vehicleNumber: { $in: DEMO_VEHICLES } },
      { customer: { $in: customerIds } }
    ]
  });
  console.log(`  ✓ Vehicles deleted: ${vehicleResult.deletedCount}`);

  // 6. Delete Customers
  const customerResult = await Customer.deleteMany({
    $or: [
      { _id: { $in: customerIds } },
      { mobile: { $in: DEMO_PHONES } }
    ]
  });
  console.log(`  ✓ Customers deleted: ${customerResult.deletedCount}`);

  // Remove manifest file if exists
  if (fs.existsSync(MANIFEST_PATH)) {
    fs.unlinkSync(MANIFEST_PATH);
    console.log('✓ Removed demo-seed.json');
  }

  console.log('✅ [CLEANUP COMPLETE] Only demo dataset was removed. Real database remains intact.\n');
}

/**
 * Generate next unique sequential Bill Number
 */
async function getNextBillNumber() {
  const currentYear = new Date().getFullYear();
  let c = await Counter.findOneAndUpdate(
    { _id: 'billNumber' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  let billNumber = `INV-${currentYear}-${String(c.seq).padStart(4, '0')}`;
  while (await Bill.exists({ billNumber })) {
    c = await Counter.findOneAndUpdate(
      { _id: 'billNumber' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    billNumber = `INV-${currentYear}-${String(c.seq).padStart(4, '0')}`;
  }
  return billNumber;
}

/**
 * Seed 15 Demo Records
 */
async function seedDemoData() {
  console.log('🚀 [SEED] Starting GarageCare Demo Seeding (15 Records)...');

  // Auto clean existing demo records first for idempotency
  await cleanDemoData();

  const today = new Date();
  const addDays = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };

  // Garage settings and payment account snapshots
  const settings = await Settings.findOne() || {};
  const paymentAccountDoc = await PaymentAccount.findOne({ isActive: true, isDefault: true })
    || await PaymentAccount.findOne({ isActive: true });

  const paymentAccountDetails = paymentAccountDoc ? {
    name: paymentAccountDoc.name,
    paymentType: paymentAccountDoc.paymentType,
    upiId: paymentAccountDoc.upiId || '',
    qrCodeUrl: paymentAccountDoc.qrCodeUrl || '',
    instructions: paymentAccountDoc.instructions || '',
    bankDetails: paymentAccountDoc.bankDetails || {}
  } : null;

  const garageDetails = {
    name: settings.garageName || 'Maurya Automobiles',
    address: settings.garageAddress || '',
    contact: settings.garageContact || '9619966132'
  };

  // 1. Create 15 Customers
  console.log('Creating 15 Demo Customers...');
  const customerConfigs = [
    { name: 'Rajesh Kumar', mobile: '9000000001' },
    { name: 'Priya Sharma', mobile: '9000000002' },
    { name: 'Amit Patel', mobile: '9000000003' },
    { name: 'Sneha Reddy', mobile: '9000000004' },
    { name: 'Vikram Malhotra', mobile: '9000000005' },
    { name: 'Ananya Deshmukh', mobile: '9000000006' },
    { name: 'Rohan Gupta', mobile: '9000000007' },
    { name: 'Pooja Verma', mobile: '9000000008' },
    { name: 'Suresh Iyer', mobile: '9000000009' },
    { name: 'Meera Nair', mobile: '9000000010' },
    { name: 'Deepak Joshi', mobile: '9000000011' },
    { name: 'Kavita Singh', mobile: '9000000012' },
    { name: 'Manoj Tiwari', mobile: '9000000013' },
    { name: 'Ritu Agarwal', mobile: '9000000014' },
    { name: 'Sanjay Mehta', mobile: '9000000015' }
  ];

  const createdCustomers = [];
  for (const cfg of customerConfigs) {
    const cust = await Customer.create(cfg);
    createdCustomers.push(cust);
  }
  console.log(`  ✓ 15 Customers created.`);

  // 2. Create 15 Vehicles with various reminder horizons
  console.log('Creating 15 Demo Vehicles with reminder dates...');
  const vehicleConfigs = [
    {
      vehicleNumber: 'MH02AB1234',
      vehicleType: '4 Wheeler',
      brand: 'Honda',
      model: 'City',
      currentKm: 38000,
      customer: createdCustomers[0]._id, // Rajesh
      insuranceExpiryDate: addDays(-4) // Overdue Insurance
    },
    {
      vehicleNumber: 'MH02CD5678',
      vehicleType: '2 Wheeler',
      brand: 'TVS',
      model: 'Wego',
      currentKm: 19200,
      customer: createdCustomers[0]._id, // Rajesh
      nextServiceDate: addDays(-2) // Overdue Service
    },
    {
      vehicleNumber: 'MH03GH3456',
      vehicleType: '4 Wheeler',
      brand: 'Hyundai',
      model: 'Creta',
      currentKm: 26000,
      customer: createdCustomers[1]._id, // Priya
      insuranceExpiryDate: addDays(5) // Due Soon (5d)
    },
    {
      vehicleNumber: 'MH04IJ7890',
      vehicleType: '2 Wheeler',
      brand: 'Royal Enfield',
      model: 'Bullet 350',
      currentKm: 14500,
      customer: createdCustomers[2]._id, // Amit
      nextServiceDate: addDays(2) // Due Soon (2d)
    },
    {
      vehicleNumber: 'MH05MN6789',
      vehicleType: '4 Wheeler',
      brand: 'Toyota',
      model: 'Innova Crysta',
      currentKm: 68000,
      customer: createdCustomers[3]._id, // Sneha
      pucExpiryDate: addDays(8) // Due in 8d
    },
    {
      vehicleNumber: 'MH02OP1122',
      vehicleType: '4 Wheeler',
      brand: 'Kia',
      model: 'Seltos',
      currentKm: 31000,
      customer: createdCustomers[4]._id, // Vikram
      nextServiceDate: addDays(-1) // Overdue (-1d)
    },
    {
      vehicleNumber: 'MH03QR3344',
      vehicleType: '2 Wheeler',
      brand: 'Honda',
      model: 'Activa 6G',
      currentKm: 15400,
      customer: createdCustomers[5]._id, // Ananya
      nextServiceDate: addDays(0) // Due Today
    },
    {
      vehicleNumber: 'MH01ST5566',
      vehicleType: '4 Wheeler',
      brand: 'Mahindra',
      model: 'Thar',
      currentKm: 22000,
      customer: createdCustomers[6]._id, // Rohan
      insuranceExpiryDate: addDays(4) // Due in 4d
    },
    {
      vehicleNumber: 'MH04UV7788',
      vehicleType: '4 Wheeler',
      brand: 'Maruti',
      model: 'Baleno',
      currentKm: 42000,
      customer: createdCustomers[7]._id, // Pooja
      pucExpiryDate: addDays(-3) // Overdue PUC
    },
    {
      vehicleNumber: 'MH02WX9900',
      vehicleType: '4 Wheeler',
      brand: 'Tata',
      model: 'Nexon EV',
      currentKm: 29000,
      customer: createdCustomers[8]._id, // Suresh
      nextServiceDate: addDays(6) // Due in 6d
    },
    {
      vehicleNumber: 'MH05YZ1234',
      vehicleType: '2 Wheeler',
      brand: 'Yamaha',
      model: 'FZ-S V3',
      currentKm: 18000,
      customer: createdCustomers[9]._id, // Meera
      insuranceExpiryDate: addDays(10) // Due in 10d
    },
    {
      vehicleNumber: 'MH03AA5678',
      vehicleType: '4 Wheeler',
      brand: 'Hyundai',
      model: 'i20 Asta',
      currentKm: 48000,
      customer: createdCustomers[10]._id, // Deepak
      nextServiceDate: addDays(12) // Due in 12d
    },
    {
      vehicleNumber: 'MH01BB9012',
      vehicleType: '2 Wheeler',
      brand: 'Suzuki',
      model: 'Access 125',
      currentKm: 21000,
      customer: createdCustomers[11]._id, // Kavita
      pucExpiryDate: addDays(14) // Due in 14d
    },
    {
      vehicleNumber: 'MH01EF9012',
      vehicleType: '4 Wheeler',
      brand: 'Maruti',
      model: 'Swift ZXi',
      currentKm: 55000,
      customer: createdCustomers[12]._id, // Manoj
      insuranceExpiryDate: addDays(20) // Due in 20d
    },
    {
      vehicleNumber: 'MH04KL2345',
      vehicleType: '2 Wheeler',
      brand: 'Bajaj',
      model: 'Pulsar 150',
      currentKm: 32000,
      customer: createdCustomers[13]._id, // Ritu
      nextServiceDate: addDays(25) // Due in 25d
    }
  ];

  const createdVehicles = [];
  for (const cfg of vehicleConfigs) {
    const veh = await Vehicle.create(cfg);
    createdVehicles.push(veh);
  }
  console.log(`  ✓ 15 Vehicles created.`);

  // 3. Create 15 Bills, Payments & Services
  console.log('Creating 15 Bills, Payments & Services...');

  const createdBills = [];
  const createdPayments = [];
  const createdServices = [];

  const billConfigs = [
    // 1. Vikram / Seltos: 03 Oct 2026 → ₹5,400 → Paid in full (UPI)
    {
      customerIndex: 4,
      vehicleIndex: 5,
      date: new Date('2026-10-03T10:30:00.000Z'),
      items: [
        { description: 'Synthetic Engine Oil 5W40 4L', quantity: 1, unitPrice: 2800, totalPrice: 2800, amount: 2800, type: 'Part' },
        { description: 'Oil & AC Filter Replacement', quantity: 1, unitPrice: 1200, totalPrice: 1200, amount: 1200, type: 'Part' },
        { description: 'Periodic Maintenance Service Labour', quantity: 1, unitPrice: 1400, totalPrice: 1400, amount: 1400, type: 'Labour' }
      ],
      totalAmount: 5400,
      paidAmount: 5400,
      paymentMethod: 'UPI',
      notes: 'Full payment via Google Pay'
    },
    // 2. Ananya / Activa 6G: 02 Oct 2026 → ₹1,850 → Partial (₹850 paid, ₹1,000 due)
    {
      customerIndex: 5,
      vehicleIndex: 6,
      date: new Date('2026-10-02T16:00:00.000Z'),
      items: [
        { description: 'Complete Scooter General Servicing', quantity: 1, unitPrice: 650, totalPrice: 650, amount: 650, type: 'Service' },
        { description: 'Castrol Scooter Engine Oil 800ml', quantity: 1, unitPrice: 450, totalPrice: 450, amount: 450, type: 'Part' },
        { description: 'Front Brake Cable & Brake Shoe', quantity: 1, unitPrice: 750, totalPrice: 750, amount: 750, type: 'Part' }
      ],
      totalAmount: 1850,
      paidAmount: 850,
      paymentMethod: 'Cash',
      notes: 'Partial cash paid on collection'
    },
    // 3. Rohan / Thar: 02 Oct 2026 → ₹8,200 → Unpaid (₹0 paid, ₹8,200 due)
    {
      customerIndex: 6,
      vehicleIndex: 7,
      date: new Date('2026-10-02T11:00:00.000Z'),
      items: [
        { description: '4x4 Suspension Bushing & Tie Rod Overhaul', quantity: 1, unitPrice: 4200, totalPrice: 4200, amount: 4200, type: 'Service' },
        { description: 'Heavy Duty Front Brake Rotors & Pads', quantity: 1, unitPrice: 2800, totalPrice: 2800, amount: 2800, type: 'Part' },
        { description: 'Underbody Greasing & Labour', quantity: 1, unitPrice: 1200, totalPrice: 1200, amount: 1200, type: 'Labour' }
      ],
      totalAmount: 8200,
      paidAmount: 0,
      paymentMethod: null,
      notes: ''
    },
    // 4. Sneha / Innova Crysta: 01 Oct 2026 → ₹6,700 → Partial (₹3,000 paid, ₹3,700 due)
    {
      customerIndex: 3,
      vehicleIndex: 4,
      date: new Date('2026-10-01T10:00:00.000Z'),
      items: [
        { description: 'Clutch Overhaul & Fluid Bleed', quantity: 1, unitPrice: 2200, totalPrice: 2200, amount: 2200, type: 'Service' },
        { description: 'Clutch Release Bearing & Pressure Plate', quantity: 1, unitPrice: 3000, totalPrice: 3000, amount: 3000, type: 'Part' },
        { description: 'Clutch Assembly Fitting Labour', quantity: 1, unitPrice: 1500, totalPrice: 1500, amount: 1500, type: 'Labour' }
      ],
      totalAmount: 6700,
      paidAmount: 3000,
      paymentMethod: 'Bank Transfer',
      notes: 'Advance transfer via IMPS'
    },
    // 5. Pooja / Baleno: 01 Oct 2026 → ₹3,600 → Paid in full (Card)
    {
      customerIndex: 7,
      vehicleIndex: 8,
      date: new Date('2026-10-01T14:15:00.000Z'),
      items: [
        { description: 'Periodic Minor Service & Coolant Top-Up', quantity: 1, unitPrice: 1600, totalPrice: 1600, amount: 1600, type: 'Service' },
        { description: 'Engine Oil Mineral 3.2L & Filter', quantity: 1, unitPrice: 1400, totalPrice: 1400, amount: 1400, type: 'Part' },
        { description: 'Washing & Vacuuming Labour', quantity: 1, unitPrice: 600, totalPrice: 600, amount: 600, type: 'Labour' }
      ],
      totalAmount: 3600,
      paidAmount: 3600,
      paymentMethod: 'Card',
      notes: 'POS card swipe'
    },
    // 6. Suresh / Nexon: 30 Sept 2026 → ₹4,800 → Paid in full (UPI)
    {
      customerIndex: 8,
      vehicleIndex: 9,
      date: new Date('2026-09-30T17:00:00.000Z'),
      items: [
        { description: 'Brake Fluid Flush & Caliper Servicing', quantity: 1, unitPrice: 1800, totalPrice: 1800, amount: 1800, type: 'Service' },
        { description: 'Front Brake Pads Ceramic', quantity: 1, unitPrice: 2100, totalPrice: 2100, amount: 2100, type: 'Part' },
        { description: 'Brake Bleeding & Testing Labour', quantity: 1, unitPrice: 900, totalPrice: 900, amount: 900, type: 'Labour' }
      ],
      totalAmount: 4800,
      paidAmount: 4800,
      paymentMethod: 'UPI',
      notes: 'Payment received via Paytm UPI'
    },
    // 7. Meera / Yamaha FZ: 29 Sept 2026 → ₹2,100 → Partial (₹1,000 paid, ₹1,100 due)
    {
      customerIndex: 9,
      vehicleIndex: 10,
      date: new Date('2026-09-29T12:00:00.000Z'),
      items: [
        { description: 'Chain Sprocket Set Replacement', quantity: 1, unitPrice: 1300, totalPrice: 1300, amount: 1300, type: 'Part' },
        { description: 'Engine Oil 10W40 1L', quantity: 1, unitPrice: 450, totalPrice: 450, amount: 450, type: 'Part' },
        { description: 'Fitting & Chain Slack Adjustment', quantity: 1, unitPrice: 350, totalPrice: 350, amount: 350, type: 'Labour' }
      ],
      totalAmount: 2100,
      paidAmount: 1000,
      paymentMethod: 'Cash',
      notes: 'Token cash payment'
    },
    // 8. Amit / Bullet 350: 28 Sept 2026 → ₹1,200 → Paid in full (Cash)
    {
      customerIndex: 2,
      vehicleIndex: 3,
      date: new Date('2026-09-28T10:00:00.000Z'),
      items: [
        { description: 'Spark Plug NGK Copper', quantity: 1, unitPrice: 400, totalPrice: 400, amount: 400, type: 'Part' },
        { description: 'Carburetor Tune & Cleaning', quantity: 1, unitPrice: 500, totalPrice: 500, amount: 500, type: 'Service' },
        { description: 'Foam Wash & Polish', quantity: 1, unitPrice: 300, totalPrice: 300, amount: 300, type: 'Labour' }
      ],
      totalAmount: 1200,
      paidAmount: 1200,
      paymentMethod: 'Cash',
      notes: 'Full payment received in cash'
    },
    // 9. Deepak / i20: 27 Sept 2026 → ₹7,500 → Unpaid (₹0 paid, ₹7,500 due)
    {
      customerIndex: 10,
      vehicleIndex: 11,
      date: new Date('2026-09-27T15:00:00.000Z'),
      items: [
        { description: 'AC Gas Charging & Leak Testing', quantity: 1, unitPrice: 2200, totalPrice: 2200, amount: 2200, type: 'Service' },
        { description: 'AC Condenser Cooling Coil Replacement', quantity: 1, unitPrice: 3800, totalPrice: 3800, amount: 3800, type: 'Part' },
        { description: 'Dashboard Removal & AC Labour', quantity: 1, unitPrice: 1500, totalPrice: 1500, amount: 1500, type: 'Labour' }
      ],
      totalAmount: 7500,
      paidAmount: 0,
      paymentMethod: null,
      notes: ''
    },
    // 10. Priya / Creta: 25 Sept 2026 → ₹8,900 → Unpaid (₹0 paid, ₹8,900 due)
    {
      customerIndex: 1,
      vehicleIndex: 2,
      date: new Date('2026-09-25T10:00:00.000Z'),
      items: [
        { description: 'Major Maintenance 30,000 KM Service', quantity: 1, unitPrice: 4500, totalPrice: 4500, amount: 4500, type: 'Service' },
        { description: 'Front Ceramic Brake Pads Set', quantity: 1, unitPrice: 3200, totalPrice: 3200, amount: 3200, type: 'Part' },
        { description: 'Wheel Balancing & Alignment Labour', quantity: 1, unitPrice: 1200, totalPrice: 1200, amount: 1200, type: 'Labour' }
      ],
      totalAmount: 8900,
      paidAmount: 0,
      paymentMethod: null,
      notes: ''
    },
    // 11. Kavita / Access 125: 22 Sept 2026 → ₹1,650 → Paid in full (UPI)
    {
      customerIndex: 11,
      vehicleIndex: 12,
      date: new Date('2026-09-22T13:30:00.000Z'),
      items: [
        { description: 'Oil Change & Transmission Gear Oil', quantity: 1, unitPrice: 650, totalPrice: 650, amount: 650, type: 'Part' },
        { description: 'Air Filter Element Replacement', quantity: 1, unitPrice: 450, totalPrice: 450, amount: 450, type: 'Part' },
        { description: 'Full General Inspection & Wash', quantity: 1, unitPrice: 550, totalPrice: 550, amount: 550, type: 'Labour' }
      ],
      totalAmount: 1650,
      paidAmount: 1650,
      paymentMethod: 'UPI',
      notes: 'Paid via PhonePe'
    },
    // 12. Rajesh / TVS Wego: 20 Sept 2026 → ₹2,300 → Partial (₹1,000 paid, ₹1,300 due)
    {
      customerIndex: 0,
      vehicleIndex: 1,
      date: new Date('2026-09-20T10:00:00.000Z'),
      items: [
        { description: 'General Scooter Service & Tune Up', quantity: 1, unitPrice: 800, totalPrice: 800, amount: 800, type: 'Service' },
        { description: 'Brake Shoes Replacement Front & Rear', quantity: 1, unitPrice: 900, totalPrice: 900, amount: 900, type: 'Part' },
        { description: 'Greasing & Cleaning Labour', quantity: 1, unitPrice: 600, totalPrice: 600, amount: 600, type: 'Labour' }
      ],
      totalAmount: 2300,
      paidAmount: 1000,
      paymentMethod: 'Cash',
      notes: 'Partial cash payment on delivery'
    },
    // 13. Manoj / Swift: 16 Sept 2026 → ₹3,900 → Paid in full (Bank Transfer)
    {
      customerIndex: 12,
      vehicleIndex: 13,
      date: new Date('2026-09-16T11:45:00.000Z'),
      items: [
        { description: 'Throttle Body Cleaning & Scanning', quantity: 1, unitPrice: 1200, totalPrice: 1200, amount: 1200, type: 'Service' },
        { description: 'Fuel Filter & Spark Plugs (Set of 4)', quantity: 1, unitPrice: 1800, totalPrice: 1800, amount: 1800, type: 'Part' },
        { description: 'Engine Diagnostic & Tune-up Labour', quantity: 1, unitPrice: 900, totalPrice: 900, amount: 900, type: 'Labour' }
      ],
      totalAmount: 3900,
      paidAmount: 3900,
      paymentMethod: 'Bank Transfer',
      notes: 'Direct NEFT transfer'
    },
    // 14. Ritu / Pulsar 150: 13 Sept 2026 → ₹2,400 → Partial (₹1,200 paid, ₹1,200 due)
    {
      customerIndex: 13,
      vehicleIndex: 14,
      date: new Date('2026-09-13T16:20:00.000Z'),
      items: [
        { description: 'Rear Shock Absorber Bush Replacement', quantity: 1, unitPrice: 850, totalPrice: 850, amount: 850, type: 'Part' },
        { description: 'Motul 7100 10W50 Synthetic 1L', quantity: 1, unitPrice: 950, totalPrice: 950, amount: 950, type: 'Part' },
        { description: 'Fitting & General Checkup Labour', quantity: 1, unitPrice: 600, totalPrice: 600, amount: 600, type: 'Labour' }
      ],
      totalAmount: 2400,
      paidAmount: 1200,
      paymentMethod: 'UPI',
      notes: 'UPI partial advance'
    },
    // 15. Rajesh / Honda City: 10 Sept 2026 → ₹4,500 → Paid in full (UPI)
    {
      customerIndex: 0,
      vehicleIndex: 0,
      date: new Date('2026-09-10T10:00:00.000Z'),
      items: [
        { description: 'Full Periodic Service & Engine Diagnostics', quantity: 1, unitPrice: 2500, totalPrice: 2500, amount: 2500, type: 'Service' },
        { description: 'Synthetic Engine Oil 5W30 3.5L', quantity: 1, unitPrice: 1500, totalPrice: 1500, amount: 1500, type: 'Part' },
        { description: 'Oil Filter Replacement & Labour', quantity: 1, unitPrice: 500, totalPrice: 500, amount: 500, type: 'Labour' }
      ],
      totalAmount: 4500,
      paidAmount: 4500,
      paymentMethod: 'UPI',
      notes: 'Full payment received via UPI'
    }
  ];

  for (const cfg of billConfigs) {
    const customer = createdCustomers[cfg.customerIndex];
    const vehicle = createdVehicles[cfg.vehicleIndex];
    const billNumber = await getNextBillNumber();

    const billDoc = await Bill.create({
      billNumber,
      customer: customer._id,
      vehicle: vehicle._id,
      date: cfg.date,
      items: cfg.items,
      totalAmount: cfg.totalAmount,
      paidAmount: cfg.paidAmount,
      discount: 0,
      status: cfg.paidAmount >= cfg.totalAmount ? 'Paid' : (cfg.paidAmount > 0 ? 'Partial' : 'Pending'),
      paymentAccount: paymentAccountDoc ? paymentAccountDoc._id : null,
      paymentAccountDetails,
      garageDetails,
      customerDetails: {
        name: customer.name,
        mobile: customer.mobile
      },
      vehicleDetails: {
        vehicleNumber: vehicle.vehicleNumber,
        currentKm: vehicle.currentKm
      }
    });

    createdBills.push(billDoc);

    // Record Payment if paidAmount > 0
    if (cfg.paidAmount > 0) {
      const paymentDoc = await Payment.create({
        customer: customer._id,
        bill: billDoc._id,
        amount: cfg.paidAmount,
        paymentDate: cfg.date,
        paymentMethod: cfg.paymentMethod || 'Cash',
        status: 'Completed',
        notes: cfg.notes || 'Payment recorded on bill generation.'
      });
      createdPayments.push(paymentDoc);
    }

    // Sync bill payment summary & corresponding service record
    await syncBillPaymentSummary(billDoc._id);
    const serviceDoc = await syncServiceForBill(billDoc);
    if (serviceDoc) {
      createdServices.push(serviceDoc);
    }

    console.log(`  ✓ Bill ${billNumber} created: ₹${cfg.totalAmount} (Paid: ₹${cfg.paidAmount}, Status: ${cfg.paidAmount >= cfg.totalAmount ? 'Paid' : (cfg.paidAmount > 0 ? 'Partial' : 'Pending')})`);
  }

  // 4. Trigger Reminder Generation via sync function
  console.log('\nTriggering syncVehicleAndBillReminders(true)...');
  await syncVehicleAndBillReminders(true);

  // Capture all reminders created for our demo customers, vehicles, or bills
  const seededReminders = await Reminder.find({
    $or: [
      { customer: { $in: createdCustomers.map(c => c._id) } },
      { vehicle: { $in: createdVehicles.map(v => v._id) } },
      { 'metadata.billId': { $in: createdBills.map(b => b._id) } }
    ]
  }).populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber');

  console.log(`  ✓ Generated ${seededReminders.length} reminders across Payment, Service, Insurance & PUC.`);

  // 5. Save all created IDs to demo-seed.json for safe cascade cleanup
  const manifest = {
    seededAt: new Date().toISOString(),
    customerIds: createdCustomers.map(c => c._id.toString()),
    vehicleIds: createdVehicles.map(v => v._id.toString()),
    billIds: createdBills.map(b => b._id.toString()),
    paymentIds: createdPayments.map(p => p._id.toString()),
    serviceIds: createdServices.map(s => s._id.toString()),
    reminderIds: seededReminders.map(r => r._id.toString())
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Saved ${MANIFEST_PATH} with all created document IDs.`);

  // 6. Print Summary
  console.log('\n============================================================');
  console.log('🎉 15 DEMO RECORDS SEEDED SUCCESSFULLY!');
  console.log('============================================================');
  console.log(`Customers (${createdCustomers.length}):`);
  createdCustomers.forEach(c => console.log(`  • ${c.name} — ${c.mobile}`));

  console.log(`\nVehicles (${createdVehicles.length}):`);
  createdVehicles.forEach(v => console.log(`  • ${v.vehicleNumber} — ${v.brand} ${v.model} (${v.vehicleType})`));

  console.log(`\nBills (${createdBills.length}):`);
  createdBills.forEach(b => console.log(`  • ${b.billNumber} — Total: ₹${b.totalAmount} | Paid: ₹${b.paidAmount}`));

  console.log(`\nPayments (${createdPayments.length}):`);
  createdPayments.forEach(p => console.log(`  • ₹${p.amount} (${p.paymentMethod}) for Bill ${p.bill}`));

  console.log(`\nReminders (${seededReminders.length}):`);
  seededReminders.forEach(r => {
    const cust = r.customer?.name || 'N/A';
    const veh = r.vehicle?.vehicleNumber || 'N/A';
    const due = r.dueDate ? r.dueDate.toISOString().slice(0, 10) : 'N/A';
    console.log(`  • [${r.type}] ${cust} - ${veh} (Due: ${due}) — Status: ${r.status}`);
  });

  console.log('\nTo clean up this demo dataset at any time, run:');
  console.log('  node server/seed-demo.js --clean');
  console.log('============================================================\n');
}

/**
 * Main Runner
 */
async function main() {
  const isClean = process.argv.includes('--clean');

  try {
    await connectToDatabase();
    if (isClean) {
      await cleanDemoData();
    } else {
      await seedDemoData();
    }
  } catch (error) {
    console.error('❌ Error executing script:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

main();
