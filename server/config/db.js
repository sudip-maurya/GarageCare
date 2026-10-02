const mongoose = require('mongoose');
const path = require('path');

// Ensure environment variables are loaded
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Masks credentials in a MongoDB URI so it can be safely logged without exposing secrets.
 * e.g., mongodb+srv://myuser:secretpassword@cluster0.mongodb.net -> mongodb+srv://myuser:****@cluster0.mongodb.net
 */
function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/i, '$1****$3');
}

/**
 * Diagnoses and formats MongoDB connection errors into actionable messages.
 */
function logConnectionDiagnostics(error, rawUri) {
  const message = error?.message || '';
  const errorName = error?.name || '';
  const errorCode = error?.code;

  console.error('\n' + '='.repeat(70));
  console.error('❌ MONGODB CONNECTION FAILED');
  console.error('='.repeat(70));

  // 1. Authentication failure
  if (
    errorCode === 8000 ||
    errorCode === 18 ||
    /authentication failed|bad auth/i.test(message)
  ) {
    console.error('\n[Root Cause] Authentication Failed');
    console.error('The database username or password in your MONGO_URI is incorrect.');
    console.error('\n[How to fix in MongoDB Atlas]:');
    console.error('1. Open MongoDB Atlas (https://cloud.mongodb.com).');
    console.error('2. Navigate to "Database Access" under the Security section in the left menu.');
    console.error('3. Verify that your database user exists.');
    console.error('4. If unsure of the password, click "Edit" -> "Edit Password" -> set a new password.');
    console.error('5. Update the password in your server/.env file.');
    console.error('6. Note: If your password contains special characters like @, #, $, or %, ensure it is URL-encoded.');
  }
  // 2. Atlas Network Access / IP Whitelist issue
  else if (
    errorName === 'MongooseServerSelectionError' ||
    errorName === 'MongoServerSelectionError' ||
    /whitelist|not allowed|Could not connect to any servers|selection timed out|querySrv|ENOTFOUND|ECONNREFUSED/i.test(message)
  ) {
    console.error('\n[Root Cause] Atlas Network Access / IP Restriction Issue');
    console.error('MongoDB Atlas rejected the connection because your current IP address is not whitelisted.');
    console.error('(Atlas blocks all connections by default until explicitly allowed in Network Access).');
    console.error('\n[How to fix in MongoDB Atlas permanently]:');
    console.error('1. Open MongoDB Atlas: https://cloud.mongodb.com');
    console.error('2. In the left sidebar under "Security", click "Network Access".');
    console.error('3. Click the "+ ADD IP ADDRESS" button.');
    console.error('4. Choose one of the following:');
    console.error('   • PERMANENT / DYNAMIC IP FIX (Recommended for development):');
    console.error('     Click "ALLOW ACCESS FROM ANYWHERE" (adds 0.0.0.0/0).');
    console.error('     This ensures your connection never breaks when your ISP or Wi-Fi assigns a new IP.');
    console.error('   • STRICT IP FIX:');
    console.error('     Click "ADD CURRENT IP ADDRESS" to whitelist only your current machine.');
    console.error('     (Note: If your ISP rotates your IP, you will need to update this again).');
    console.error('5. Click "Confirm".');
    console.error('6. Wait 1-2 minutes for the status to change from "Pending" to "Active".');
    console.error('7. Restart the GarageCare server.');
  }
  // 3. General failure
  else {
    console.error('\n[Root Cause] General Connection Failure');
    console.error('Error details:', message);
    console.error('\n[Checklist]:');
    console.error('• Ensure your device has an active internet connection.');
    console.error('• Verify your cluster is active and not paused in MongoDB Atlas.');
    console.error('• Target URI (masked):', maskMongoUri(rawUri));
  }

  console.error('='.repeat(70) + '\n');
}

/**
 * Connects to MongoDB Atlas using Mongoose.
 */
async function connectDB() {
  const rawUri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();

  // Validate presence
  if (!rawUri) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ MONGODB CONFIGURATION ERROR: MONGO_URI is missing!');
    console.error('='.repeat(70));
    console.error('No MongoDB connection string was found in process.env.');
    console.error('Please verify that server/.env exists and contains:');
    console.error('MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority');
    console.error('='.repeat(70) + '\n');
    throw new Error('MONGO_URI is missing in environment variables.');
  }

  // Validate protocol
  if (!rawUri.startsWith('mongodb://') && !rawUri.startsWith('mongodb+srv://')) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ MONGODB CONFIGURATION ERROR: Invalid URI format!');
    console.error('='.repeat(70));
    console.error(`Provided URI: "${maskMongoUri(rawUri)}"`);
    console.error('A valid MongoDB URI must begin with "mongodb://" or "mongodb+srv://".');
    console.error('Please check server/.env.');
    console.error('='.repeat(70) + '\n');
    throw new Error('Invalid MongoDB URI protocol.');
  }

  // Clean Mongoose 9.x / MongoDB Driver connection options
  const mongooseOptions = {
    serverSelectionTimeoutMS: 8000, // Fail fast (8s) with actionable diagnostics instead of hanging
    socketTimeoutMS: 45000,
  };

  try {
    const conn = await mongoose.connect(rawUri, mongooseOptions);
    console.log(` MongoDB connected successfully to database: "${conn.connection.name}"`);
    return conn;
  } catch (error) {
    logConnectionDiagnostics(error, rawUri);
    throw error;
  }
}

// Connection lifecycle event listeners
mongoose.connection.on('error', (err) => {
  console.error('⚠️  MongoDB runtime error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB connection lost. Driver will attempt to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log(' MongoDB reconnected successfully.');
});

module.exports = connectDB;
