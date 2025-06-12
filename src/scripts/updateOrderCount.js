import mongoose from 'mongoose';
import OrderGroup from '../models/OrderGroup.js';
import MenuItem from '../models/MenuItem.js';
import Order from '../models/Order.js';
import connectDB from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

connectDB();

async function updateOrderCounts() {
  try {
    const orderGroups = await OrderGroup.find({ payment_status: 'Đã thanh toán' })
      .populate('orders');

    for (const orderGroup of orderGroups) {
      const itemCounts = {};
      for (const order of orderGroup.orders) {
        for (const item of order.items) {
          const itemId = item.item_id.toString();
          itemCounts[itemId] = (itemCounts[itemId] || 0) + (item.quantity || 1);
        }
      }

      const bulkUpdates = Object.entries(itemCounts).map(([itemId, count]) => ({
        updateOne: {
          filter: { _id: itemId },
          update: { $inc: { order_count: count } },
        },
      }));

      if (bulkUpdates.length > 0) {
        await MenuItem.bulkWrite(bulkUpdates);
      }
    }

    console.log('Order counts updated successfully');
  } catch (error) {
    console.error('Error updating order counts:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateOrderCounts();