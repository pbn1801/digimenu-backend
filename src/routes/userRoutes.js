import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getCurrentUser } from '../controllers/userController.js';

const router = express.Router();

router.route('/me').get(protect, getCurrentUser);

export default router;