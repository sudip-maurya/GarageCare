const express = require('express');
const router = express.Router();
const {
  getVehicles,
  getVehicleById,
  searchVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle
} = require('../controllers/vehicleController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getVehicles)
  .post(protect, createVehicle);

router.route('/search/:query')
  .get(protect, searchVehicle);

router.route('/:id')
  .get(protect, getVehicleById)
  .put(protect, updateVehicle)
  .delete(protect, deleteVehicle);

module.exports = router;
