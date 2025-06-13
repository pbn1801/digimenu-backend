import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getRestaurantBySlug, getAllRestaurants } from '../controllers/restaurantController.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/:slug', getRestaurantBySlug); // Lấy chi tiết nhà hàng theo slug

// Authenticated routes (require admin login)
router.get('/', protect, getAllRestaurants); // Lấy danh sách tất cả nhà hàng của admin

export default router;