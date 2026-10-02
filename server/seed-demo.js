/**
 * ============================================================================
 * ⚠ SIRF DEV/LOCAL DB PAR CHALAO — PRODUCTION PAR KABHI NAHI ⚠
 * ============================================================================
 * GarageCare Demo Data Seed & Cleanup Utility
 * 
 * Usage:
 *   node server/seed-demo.js          -> Seed demo customers, vehicles, bills, payments & reminders
 *   node server/seed-demo.js --clean  -> Clean only demo seeded documents recorded in demo-seed.json
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

// Constant Demo Identifiers for safety verification
const DEMO_PHONES = ['9000000001', '9000000002', '9000000003', '9000000004'];
const DEMO_VEHICLES = [
  'MH02AB1234',
  'MH02CD5678',
  'MH01EF9012',
  'MH03GH3456',
  'MH04IJ7890',
  'MH04KL2345',
  'MH05MN6789'
];

/**
 * Connect to MongoDB database
 */
async function connectToDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI missing in server/.env');
    process.exit(1);
  }

  // Safety confirmation
  console.log('------------------------------------------------------------');
  console.log('⚠  WARNING: SIRF DEV/LOCAL DB PAR CHALAO — PRODUCTION PAR KABHI NAHI');
  console.log(`Connecting to: ${uri.replace(/:([^@]+)@/, ':****@')}`);
  console.log('------------------------------------------------------------');

  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB\n');
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

  console.log('✅ [CLEANUP COMPLETE] Only demo dataset was removed. Real data remains intact.\n');
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
 * Seed Demo Dataset
 */
async function seedDemoData() {
  console.log('🚀 [SEED] Starting GarageCare Demo Seeding...');

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

  // 1. Create Customers
  console.log('Creating 4 Demo Customers...');
  const rajesh = await Customer.create({ name: 'Rajesh Kumar', mobile: '9000000001' });
  const priya = await Customer.create({ name: 'Priya Sharma', mobile: '9000000002' });
  const amit = await Customer.create({ name: 'Amit Patel', mobile: '9000000003' });
  const sneha = await Customer.create({ name: 'Sneha Reddy', mobile: '9000000004' });

  const createdCustomers = [rajesh, priya, amit, sneha];
  console.log(`  ✓ 4 Customers created.`);

  // 2. Create Vehicles
  console.log('Creating 7 Demo Vehicles with reminder dates...');
  // Rajesh (3 vehicles)
  const rajeshCity = await Vehicle.create({
    vehicleNumber: 'MH02AB1234',
    vehicleType: '4 Wheeler',
    brand: 'Honda',
    model: 'City',
    currentKm: 35000,
    customer: rajesh._id,
    insuranceExpiryDate: addDays(-5) // Past overdue insurance
  });

  const rajeshWego = await Vehicle.create({
    vehicleNumber: 'MH02CD5678',
    vehicleType: '2 Wheeler',
    brand: 'TVS',
    model: 'Wego',
    currentKm: 18500,
    customer: rajesh._id,
    nextServiceDate: addDays(-3) // Past overdue service
  });

  const rajeshSwift = await Vehicle.create({
    vehicleNumber: 'MH01EF9012',
    vehicleType: '4 Wheeler',
    brand: 'Maruti',
    model: 'Swift',
    currentKm: 52000,
    customer: rajesh._id
  });

  // Priya (1 vehicle)
  const priyaCreta = await Vehicle.create({
    vehicleNumber: 'MH03GH3456',
    vehicleType: '4 Wheeler',
    brand: 'Hyundai',
    model: 'Creta',
    currentKm: 24000,
    customer: priya._id,
    insuranceExpiryDate: addDays(8) // Next 10 days insurance
  });

  // Amit (2 vehicles)
  const amitBullet = await Vehicle.create({
    vehicleNumber: 'MH04IJ7890',
    vehicleType: '2 Wheeler',
    brand: 'Royal Enfield',
    model: 'Bullet',
    currentKm: 12000,
    customer: amit._id,
    nextServiceDate: addDays(4) // Next 7 days service
  });

  const amitPulsar = await Vehicle.create({
    vehicleNumber: 'MH04KL2345',
    vehicleType: '2 Wheeler',
    brand: 'Bajaj',
    model: 'Pulsar',
    currentKm: 28000,
    customer: amit._id
  });

  // Sneha (1 vehicle)
  const snehaInnova = await Vehicle.create({
    vehicleNumber: 'MH05MN6789',
    vehicleType: '4 Wheeler',
    brand: 'Toyota',
    model: 'Innova',
    currentKm: 65000,
    customer: sneha._id,
    pucExpiryDate: addDays(12) // Next 15 days PUC
  });

  const createdVehicles = [
    rajeshCity,
    rajeshWego,
    rajeshSwift,
    priyaCreta,
    amitBullet,
    amitPulsar,
    snehaInnova
  ];
  console.log(`  ✓ 7 Vehicles created.`);

  // 3. Create Bills & Payments
  console.log('Creating Bills & Payments...');

  const createdBills = [];
  const createdPayments = [];
  const createdServices = [];

  const billConfigs = [
    // 1. Rajesh / Honda City: 10 Sept 2026 → ₹4,500 → Paid in full
    {
      customer: rajesh,
      vehicle: rajeshCity,
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
    },
    // 2. Rajesh / TVS Wego: 20 Sept 2026 → ₹2,300 → Partially paid (₹1,000 paid, ₹1,300 outstanding)
    {
      customer: rajesh,
      vehicle: rajeshWego,
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
    // 3. Priya / Creta: 25 Sept 2026 → ₹8,900 → Unpaid (₹0 paid)
    {
      customer: priya,
      vehicle: priyaCreta,
      date: new Date('2026-09-25T10:00:00.000Z'),
      items: [
        { description: 'Major Maintenance Service 20,000 KM', quantity: 1, unitPrice: 4500, totalPrice: 4500, amount: 4500, type: 'Service' },
        { description: 'Front Ceramic Brake Pads Set', quantity: 1, unitPrice: 3200, totalPrice: 3200, amount: 3200, type: 'Part' },
        { description: 'Wheel Balancing & Alignment Labour', quantity: 1, unitPrice: 1200, totalPrice: 1200, amount: 1200, type: 'Labour' }
      ],
      totalAmount: 8900,
      paidAmount: 0,
      paymentMethod: null,
      notes: ''
    },
    // 4. Amit / Bullet: 28 Sept 2026 → ₹1,200 → Paid in full
    {
      customer: amit,
      vehicle: amitBullet,
      date: new Date('2026-09-28T10:00:00.000Z'),
      items: [
        { description: 'General Inspection & Chain Lubrication', quantity: 1, unitPrice: 500, totalPrice: 500, amount: 500, type: 'Service' },
        { description: 'NGK Spark Plug', quantity: 1, unitPrice: 400, totalPrice: 400, amount: 400, type: 'Part' },
        { description: 'Labour & Foam Wash', quantity: 1, unitPrice: 300, totalPrice: 300, amount: 300, type: 'Labour' }
      ],
      totalAmount: 1200,
      paidAmount: 1200,
      paymentMethod: 'Cash',
      notes: 'Full payment received in cash'
    },
    // 5. Sneha / Innova: 01 Oct 2026 → ₹6,700 → Partially paid (₹3,000 paid, ₹3,700 outstanding)
    {
      customer: sneha,
      vehicle: snehaInnova,
      date: new Date('2026-10-01T10:00:00.000Z'),
      items: [
        { description: 'Suspension Check & Overhaul', quantity: 1, unitPrice: 2200, totalPrice: 2200, amount: 2200, type: 'Service' },
        { description: 'Front Stabilizer Bushing Kit', quantity: 1, unitPrice: 3000, totalPrice: 3000, amount: 3000, type: 'Part' },
        { description: 'Suspension Fitting & Overhaul Labour', quantity: 1, unitPrice: 1500, totalPrice: 1500, amount: 1500, type: 'Labour' }
      ],
      totalAmount: 6700,
      paidAmount: 3000,
      paymentMethod: 'Bank Transfer',
      notes: 'Advance/Part payment received via IMPS'
    }
  ];

  for (const cfg of billConfigs) {
    const billNumber = await getNextBillNumber();
    const billDoc = await Bill.create({
      billNumber,
      customer: cfg.customer._id,
      vehicle: cfg.vehicle._id,
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
        name: cfg.customer.name,
        mobile: cfg.customer.mobile
      },
      vehicleDetails: {
        vehicleNumber: cfg.vehicle.vehicleNumber,
        currentKm: cfg.vehicle.currentKm
      }
    });

    createdBills.push(billDoc);

    // Record Payment if paidAmount > 0
    if (cfg.paidAmount > 0) {
      const paymentDoc = await Payment.create({
        customer: cfg.customer._id,
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
  console.log('🎉 DEMO DATA SEEDED SUCCESSFULLY!');
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
