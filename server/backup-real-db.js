/**
 * Backup script for Real Database
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TARGET_DB = process.env.TARGET_DB || 'test';

async function backupDatabase() {
  if (TARGET_DB === 'garagecare-demo') {
    console.error('❌ FORBIDDEN: Cannot target demo database!');
    process.exit(1);
  }

  const baseUri = process.env.MONGO_URI;
  const targetUri = baseUri.replace(/\/garagecare-demo\?/, `/${TARGET_DB}?`);

  console.log(`Connecting to backup target DB: ${TARGET_DB}...`);
  const conn = await mongoose.createConnection(targetUri).asPromise();
  console.log('✓ Connected successfully.\n');

  const todayStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
  const backupDir = path.join(__dirname, 'backups', `${TARGET_DB}_backup_${todayStr}_${timeStr}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const cols = await conn.db.listCollections().toArray();
  const summary = {
    database: TARGET_DB,
    timestamp: new Date().toISOString(),
    collections: {}
  };

  console.log(`=== BACKING UP DATABASE: ${TARGET_DB} ===`);
  console.log(`Backup destination: ${backupDir}\n`);

  for (const col of cols) {
    const colName = col.name;
    const docs = await conn.db.collection(colName).find().toArray();
    const filePath = path.join(backupDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
    summary.collections[colName] = docs.length;
    console.log(`  ✓ Exported ${colName}: ${docs.length} documents -> ${filePath}`);
  }

  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n✅ Backup completed successfully in: ${backupDir}\n`);

  await conn.close();
  return backupDir;
}

if (require.main === module) {
  backupDatabase().catch(err => {
    console.error('Backup error:', err);
    process.exit(1);
  });
}

module.exports = { backupDatabase };
