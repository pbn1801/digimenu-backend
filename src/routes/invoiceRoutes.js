import express from 'express';
import { getInvoices, getInvoiceById} from '../controllers/invoiceController.js';
import { protect, staffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();


// Route cho lấy tất cả hóa đơn với filter
router.route('/').get(protect, staffOrAdmin, getInvoices);

// Route cho lấy hóa đơn theo ID
router.route('/:id').get(protect, staffOrAdmin, getInvoiceById);

export default router;