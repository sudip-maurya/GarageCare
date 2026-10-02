const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'payment-qr');
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => callback(null, `qr-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
});

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

const imageOnly = (_req, file, callback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext) || !file.mimetype.startsWith('image/')) {
    return callback(new Error('Only JPG, JPEG, PNG, or WEBP image files can be used as a payment QR code.'));
  }
  callback(null, true);
};

module.exports = multer({ storage, fileFilter: imageOnly, limits: { fileSize: 3 * 1024 * 1024 } });
