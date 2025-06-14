import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getAllUsers, getRevenue, getRevenueByDay, getRevenueByMonth, getPopularItems } from '../controllers/adminController.js';

const router = express.Router();

router.route('/users').get(protect, admin, getAllUsers);
router.route('/revenue').get(protect, admin, getRevenue);
router.route('/revenue-by-day').get(protect, admin, getRevenueByDay);
router.route('/revenue-by-month').get(protect, admin, getRevenueByMonth);
router.route('/popular-items').get(protect, admin, getPopularItems);

export default router;