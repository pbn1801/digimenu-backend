import express from 'express';
import { loginUser, registerAdmin, getCurrentUser } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerAdmin); 
router.get('/me', protect, getCurrentUser);

export default router;