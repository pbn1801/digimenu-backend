import express from 'express';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../controllers/userController.js';
import { protect, admin, staffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Create staff (only admin)
router.post('/add', protect, admin, createUser);

// Get all staff (admin and staff)
router.get('/view', protect, staffOrAdmin, getUsers);

// Get staff by ID (admin and staff)
router.get('/view/:id', protect, staffOrAdmin, getUserById);

// Update staff (only admin)
router.put('/edit/:id', protect, admin, updateUser);

// Delete staff (only admin)
router.delete('/delete/:id', protect, admin, deleteUser);

export default router;