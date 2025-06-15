import express from 'express';
import { webhookPayment } from '../controllers/orderGroupController.js'; 

const router = express.Router();

router.post('/payment', webhookPayment);

export default router;