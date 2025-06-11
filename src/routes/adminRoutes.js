import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getAllUsers, getRevenue } from '../controllers/adminController.js';

const router = express.Router();

router.route('/users').get(protect, admin, getAllUsers);
router.route('/revenue').get(protect, admin, getRevenue);

export default router;