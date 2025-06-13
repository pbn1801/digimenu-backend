import express from 'express';
import { getAllRestaurants } from '../controllers/restaurantController.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', getAllRestaurants); // Lấy danh sách tất cả nhà hàng hoặc chi tiết theo slug

export default router;