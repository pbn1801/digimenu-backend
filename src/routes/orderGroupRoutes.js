import express from 'express';
import {
  getOrderGroups,
  updateOrderGroup,
  getOrderGroupById,
  getOrderGroupByTableName,
} from '../controllers/orderGroupController.js';
import { protect, staffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/').get(protect, staffOrAdmin, getOrderGroups); // Staff or Admin only
router.route('/:id/pay').put(protect, staffOrAdmin, updateOrderGroup); // Staff or Admin only
router.route('/:id').get(protect, staffOrAdmin, getOrderGroupById); // Staff or Admin only
router.route('/table/:name').get(protect, staffOrAdmin, getOrderGroupByTableName); // Staff or Admin only - New endpoint

export default router;