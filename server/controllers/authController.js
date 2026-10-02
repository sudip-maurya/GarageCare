const Owner = require('../models/Owner');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Auth owner & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const owner = await Owner.findOne({ username });

    if (owner && (await owner.matchPassword(password))) {
      res.json({
        _id: owner._id,
        username: owner.username,
        name: owner.name,
        token: generateToken(owner._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('login:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const owner = await Owner.findById(req.owner._id);

    if (owner && (await owner.matchPassword(oldPassword))) {
      owner.password = newPassword;
      await owner.save();
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(401).json({ message: 'Invalid old password' });
    }
  } catch (error) {
    console.error('changePassword:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Logout owner
// @route   POST /api/auth/logout
// @access  Private
const logout = (req, res) => {
  // In JWT, logout is typically handled on the client by removing the token.
  // We can just send a success message.
  res.json({ message: 'Logged out successfully' });
};

// @desc    Get current logged-in owner (token verification)
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  // req.owner is set by the protect middleware after JWT verification
  res.json({
    _id: req.owner._id,
    username: req.owner.username,
    name: req.owner.name,
  });
};

module.exports = { login, changePassword, logout, getMe };
