import express from 'express';
import { getInvoices, getInvoiceById, getInvoiceByOrderGroupId } from '../controllers/invoiceController.js';
import { protect, staffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route cho lấy tất cả hóa đơn với filter (Public)
router.route('/').get(getInvoices);

// Route cho lấy hóa đơn theo ID (Giữ bảo mật)
router.route('/:id').get(protect, staffOrAdmin, getInvoiceById);

// Route cho lấy hóa đơn theo order_group_id (Giữ bảo mật)
router.route('/order-group/:order_group_id').get(protect, staffOrAdmin, getInvoiceByOrderGroupId);

export default router;