/**
 * ============================================================================
 * ⚠ DANGER: REAL DATABASE CLEANUP SCRIPT ⚠
 * ============================================================================
 * STRICT SAFETY RULES:
 * 1. NEVER TOUCH OR QUERY garagecare-demo DATABASE.
 * 2. ONLY TARGETS REAL DATABASE (test / mauryaautomobile).
 * 3. TAKES FULL BACKUP FIRST.
 * 4. CASCADE DELETION ORDER:
 *    reminders -> payments -> bills -> services -> vehicles -> customers
 * 5. PRESERVED COLLECTIONS:
 *    settings, paymentaccounts, owners, insuranceagents
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { backupDatabase } = require('./backup-real-db');

const TARGET_DB = process.env.TARGET_DB || 'test';

// FORBIDDEN DEMO DATABASE
if (TARGET_DB === 'garagecare-demo' || TARGET_DB.includes('demo')) {
  console.error('\n❌ FATAL ERROR: Cannot target demo database! Script aborted.\n');
  process.exit(1);
}

async function runCleanup(options = {}) {
  const { confirmation = false, resetCounter = true } = options;

  console.log('\n============================================================');
  console.log('⚠ DANGER: DATABASE CLEANUP (REAL DATABASE ONLY) ⚠');
  console.log('============================================================');
  console.log(`YE DATABASE CLEAR HOGA: ${TARGET_DB}`);
  console.log('DEMO DATABASE (garagecare-demo): UNTOUCHED');
  console.log('============================================================\n');

  if (!confirmation) {
    console.error('❌ Aborted: Explicit "CLEAR" confirmation required.');
    process.exit(1);
  }

  // 1. Take Backup First
  console.log('📦 Step 1: Taking Full Pre-Cleanup Backup...');
  const backupPath = await backupDatabase();

  // 2. Connect to Target Real Database
  const baseUri = process.env.MONGO_URI;
  const targetUri = baseUri.replace(/\/garagecare-demo\?/, `/${TARGET_DB}?`);

  console.log(`\nConnecting to target database: ${TARGET_DB}...`);
  const conn = await mongoose.createConnection(targetUri).asPromise();
  const db = conn.db;
  console.log(`✓ Connected to ${TARGET_DB}\n`);

  // Verify DB name from connection
  if (db.databaseName === 'garagecare-demo' || db.databaseName.includes('demo')) {
    console.error('❌ SAFETY ABORT: Connected DB name contains "demo"! Aborting immediately.');
    await conn.close();
    process.exit(1);
  }

  console.log('🗑 Step 2: Deleting Business Data in Cascade Order...');

  // Cascade Order: reminders -> payments -> bills -> services -> vehicles -> customers
  const deletionOrder = [
    { name: 'reminders', label: 'Reminders' },
    { name: 'payments', label: 'Payments' },
    { name: 'bills', label: 'Bills' },
    { name: 'services', label: 'Services' },
    { name: 'vehicles', label: 'Vehicles' },
    { name: 'customers', label: 'Customers' }
  ];

  const results = {};

  for (const item of deletionOrder) {
    try {
      const res = await db.collection(item.name).deleteMany({});
      results[item.name] = res.deletedCount;
      console.log(`  ✓ Deleted ${item.label} (${item.name}): ${res.deletedCount} documents`);
    } catch (e) {
      console.warn(`  ⚠ Could not delete from ${item.name}: ${e.message}`);
      results[item.name] = 0;
    }
  }

  // Handle Bill Counter
  if (resetCounter) {
    try {
      await db.collection('counters').updateOne(
        { _id: 'billNumber' },
        { $set: { seq: 0 } },
        { upsert: true }
      );
      console.log('  ✓ Reset bill sequence counter to 0 (Next bill will be #INV-2026-0001).');
    } catch (e) {
      console.warn('  ⚠ Counter update note:', e.message);
    }
  } else {
    console.log('  ℹ Counter preserved as-is.');
  }

  // Step 3: Verification
  console.log('\n🔍 Step 3: Verifying Collection Counts in Target Database...');
  const allCols = await db.listCollections().toArray();
  const finalCounts = {};

  for (const c of allCols) {
    const count = await db.collection(c.name).countDocuments();
    finalCounts[c.name] = count;
  }

  const settingsDoc = await db.collection('settings').findOne();
  const preservedGarageName = settingsDoc ? settingsDoc.garageName : 'NONE';

  console.log('------------------------------------------------------------');
  console.log(`DATABASE: ${TARGET_DB} (POST-CLEANUP STATUS)`);
  console.log('------------------------------------------------------------');
  for (const [col, count] of Object.entries(finalCounts)) {
    const isCleared = ['customers', 'vehicles', 'bills', 'payments', 'services', 'reminders'].includes(col);
    const badge = isCleared ? (count === 0 ? '✓ CLEARED (0)' : '✗ FAILED') : '✓ PRESERVED';
    console.log(`  • ${col}: ${count} [${badge}]`);
  }
  console.log(`  • Settings garageName: "${preservedGarageName}" [✓ PRESERVED]`);
  console.log('------------------------------------------------------------');
  console.log(`Backup saved at: ${backupPath}`);
  console.log('============================================================\n');

  await conn.close();
  return { backupPath, finalCounts, preservedGarageName };
}

// CLI Interactive Handler
if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n============================================================');
  console.log('⚠ DANGER: DATABASE CLEANUP SCRIPT');
  console.log('============================================================');
  console.log(`YE DATABASE CLEAR HOGA: ${TARGET_DB}`);
  console.log('DEMO DATABASE: garagecare-demo (WILL NOT BE TOUCHED)');
  console.log('============================================================\n');

  rl.question('Type "CLEAR" to proceed with cleaning this database: ', (answer) => {
    if (answer.trim() !== 'CLEAR') {
      console.log('❌ Cancelled. Input did not match "CLEAR".');
      rl.close();
      process.exit(0);
    }

    rl.question('Reset bill sequence to #INV-2026-0001? (yes/no) [default: yes]: ', async (counterAns) => {
      const resetCounter = counterAns.trim().toLowerCase() !== 'no';
      rl.close();
      try {
        await runCleanup({ confirmation: true, resetCounter });
      } catch (err) {
        console.error('Cleanup failed:', err);
        process.exit(1);
      }
    });
  });
}

module.exports = { runCleanup };
