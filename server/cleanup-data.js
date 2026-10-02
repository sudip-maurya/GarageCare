const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

// Collections to clear completely
const collectionsToClear = [
  { name: 'customers', label: 'Customers' },
  { name: 'vehicles', label: 'Vehicles (includes insurance expiry/renewal data)' },
  { name: 'services', label: 'Service Records' },
  { name: 'bills', label: 'Bills' },
  { name: 'payments', label: 'Payment Transactions' },
  { name: 'reminders', label: 'Reminders' }
];

// Collections to preserve completely
const collectionsToPreserve = [
  { name: 'owners', label: 'Admin/Owner/Staff Login Accounts' },
  { name: 'settings', label: 'Garage Profile & Settings' },
  { name: 'insuranceagents', label: 'Insurance Agent Accounts' },
  { name: 'paymentaccounts', label: 'Payment Accounts' }
];

async function cleanup() {
  console.log('=== GarageCare Data Cleanup ===\n');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // List all collections
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);
    console.log('All collections in database:');
    collectionNames.forEach(name => console.log(`  - ${name}`));
    console.log('');
    
    // Phase 1: Verify collections to preserve
    console.log('=== Phase 1: Verifying Collections to Preserve ===\n');
    for (const { name, label } of collectionsToPreserve) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        console.log(`  ✓ ${name} (${label}): ${count} documents — WILL BE PRESERVED`);
      } else {
        console.log(`  ⚠ ${name} (${label}): not found — skipped`);
      }
    }
    console.log('');
    
    // Phase 2: Count documents before deletion
    console.log('=== Phase 2: Document Counts Before Deletion ===\n');
    const beforeCounts = {};
    for (const { name, label } of collectionsToClear) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        beforeCounts[name] = count;
        console.log(`  ${name} (${label}): ${count} documents`);
      } else {
        beforeCounts[name] = 0;
        console.log(`  ⚠ ${name} (${label}): collection not found — skipped`);
      }
    }
    console.log('');
    
    // Phase 3: Delete data
    console.log('=== Phase 3: Deleting Data ===\n');
    const deletedCounts = {};
    
    for (const { name, label } of collectionsToClear) {
      if (collectionNames.includes(name)) {
        const result = await db.collection(name).deleteMany({});
        deletedCounts[name] = result.deletedCount;
        console.log(`  ✓ ${name}: Deleted ${result.deletedCount} documents`);
      } else {
        deletedCounts[name] = 0;
        console.log(`  ⚠ ${name}: collection not found — nothing to delete`);
      }
    }
    console.log('');
    
    // Phase 4: Verify deletion
    console.log('=== Phase 4: Verification After Deletion ===\n');
    
    console.log('Collections to clear — verification:');
    let allCleared = true;
    for (const { name, label } of collectionsToClear) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        const status = count === 0 ? '✓ EMPTY' : '✗ STILL HAS DATA';
        if (count > 0) allCleared = false;
        console.log(`  ${status} — ${name} (${label}): ${count} documents remaining`);
      } else {
        console.log(`  ✓ ${name} (${label}): collection does not exist`);
      }
    }
    console.log('');
    
    console.log('Collections to preserve — verification:');
    for (const { name, label } of collectionsToPreserve) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        console.log(`  ✓ ${name} (${label}): ${count} documents — INTACT`);
      } else {
        console.log(`  ⚠ ${name} (${label}): not found`);
      }
    }
    console.log('');
    
    // Summary
    console.log('=== SUMMARY ===\n');
    console.log('DATA DELETED:');
    let totalDeleted = 0;
    for (const { name, label } of collectionsToClear) {
      const deleted = deletedCounts[name] || 0;
      if (deleted > 0) {
        console.log(`  • ${name}: ${deleted} records`);
        totalDeleted += deleted;
      }
    }
    console.log(`\n  Total records deleted: ${totalDeleted}`);
    console.log('\nDATA PRESERVED:');
    for (const { name, label } of collectionsToPreserve) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        console.log(`  • ${name}: ${count} records (untouched)`);
      }
    }
    console.log('\n  ✓ Database NOT dropped');
    console.log('  ✓ All collections still exist');
    console.log('  ✓ Login accounts preserved');
    console.log('  ✓ Garage settings preserved');
    console.log('');
    
    if (allCleared) {
      console.log('✅ ALL TARGETED DATA SUCCESSFULLY CLEARED');
    } else {
      console.log('⚠ SOME DATA COULD NOT BE CLEARED — check above for details');
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

cleanup();