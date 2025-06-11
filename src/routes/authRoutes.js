import express from 'express';
import { loginUser, getCurrentUser } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.get('/me', protect, getCurrentUser);

export default router;