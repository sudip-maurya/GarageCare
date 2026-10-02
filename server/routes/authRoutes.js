const express = require('express');
const router = express.Router();
const { login, changePassword, logout, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', protect, getMe); // Verifies the JWT is valid & not expired
router.post('/change-password', protect, changePassword);
router.post('/logout', protect, logout);

module.exports = router;
