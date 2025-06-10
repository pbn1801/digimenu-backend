import express from 'express';
import authRoutes from './authRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import menuItemRoutes from './menuItemRoutes.js';
import tableRoutes from './tableRoutes.js';
import orderRoutes from './orderRoutes.js';
import orderGroupRoutes from './orderGroupRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import userRoutes from './userRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/menu-items', menuItemRoutes);
router.use('/tables', tableRoutes);
router.use('/orders', orderRoutes);
router.use('/order-groups', orderGroupRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);

export default router;