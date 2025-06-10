import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getAllUsers } from '../controllers/adminController.js';

const router = express.Router();

router.route('/users').get(protect, admin, getAllUsers);

export default router;