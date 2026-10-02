const express = require('express');
const router = express.Router();
const {
  getServices,
  getServiceById,
  getServicesByVehicle,
  createService,
  updateService,
  deleteService
} = require('../controllers/serviceController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getServices)
  .post(protect, createService);

router.route('/vehicle/:vehicleId')
  .get(protect, getServicesByVehicle);

router.route('/:id')
  .get(protect, getServiceById)
  .put(protect, updateService)
  .delete(protect, deleteService);

module.exports = router;
