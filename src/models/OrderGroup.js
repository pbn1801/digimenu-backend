import mongoose from 'mongoose';

const orderGroupSchema = new mongoose.Schema({
  restaurant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  table_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    required: true,
  },
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
  ],
  total_cost: { 
    type: Number,
    required: true,
    default: 0,
  },
  payment_status: {
    type: String,
    enum: ['Chưa thanh toán', 'Đã thanh toán'],
    default: 'Chưa thanh toán',
  },
  payment_method: {
    type: String,
    enum: ['QR', 'Tiền mặt'],
    default: null,
  },
  payment_date: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const OrderGroup = mongoose.model('OrderGroup', orderGroupSchema);

export default OrderGroup;