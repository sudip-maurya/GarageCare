const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

// Ensure uploads directory exists on server startup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const { protect } = require('./middleware/auth');

// Middleware
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean) 
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, mobile) or server-to-server
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/+$/, '');

    // Allow wildcard or explicit match
    if (allowedOrigins.includes('*') || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // Automatically allow Vercel preview/branch URLs if any vercel.app domain is in CLIENT_URL
    const isVercelAllowed = allowedOrigins.some(ao => 
      ao.includes('.vercel.app') && normalizedOrigin.endsWith('.vercel.app')
    );
    if (isVercelAllowed) {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const billRoutes = require('./routes/billRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentAccountRoutes = require('./routes/paymentAccountRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const reportRoutes = require('./routes/reportRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-accounts', paymentAccountRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "GarageCare API is running 🚗"
  });
});

// 404 handler for undefined API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: `API route ${req.method} ${req.originalUrl} not found` });
  }
  next();
});

// Global error handling middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled server error:', err);
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start the server only AFTER MongoDB is connected
async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is missing. Set it in the server .env file.');
    }

    await connectDB();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚗 GarageCare server running on port ${PORT}`);
    });
  } catch (error) {
    // Diagnostic details are already formatted and logged by connectDB
    process.exit(1);
  }
}

// Graceful shutdown: close the MongoDB connection before exiting
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(0);
});

process.on("SIGTERM", async () => {
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(0);
});

startServer();