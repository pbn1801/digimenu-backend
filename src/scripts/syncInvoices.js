import mongoose from 'mongoose';
import OrderGroup from '../models/OrderGroup.js';
import Invoice from '../models/Invoice.js';
import Restaurant from '../models/Restaurant.js';
import { createInvoice } from '../controllers/invoiceController.js';
import connectDB from '../config/db.js'; // Sử dụng module kết nối hiện có
import dotenv from 'dotenv';

dotenv.config();

const syncInvoices = async () => {
  try {
    // Kết nối tới database
    await connectDB();

    // Tìm tất cả ordergroup đã thanh toán
    const paidOrderGroups = await OrderGroup.find({
      payment_status: 'Đã thanh toán',
    }).lean(); // Sử dụng lean() để lấy dữ liệu thô, tăng hiệu suất

    console.log(`Found ${paidOrderGroups.length} paid order groups to check.`);

    for (const orderGroup of paidOrderGroups) {
      // Kiểm tra xem ordergroup đã có invoice chưa
      const existingInvoice = await Invoice.findOne({
        order_group_id: orderGroup._id,
      });

      if (existingInvoice) {
        // Cập nhật existingInvoice để thêm restaurant_id
        const restaurant = await Restaurant.findById(orderGroup.restaurant_id).select('_id');
        if (restaurant) {
          existingInvoice.restaurant_info = {
            ...existingInvoice.restaurant_info,
            restaurant_id: restaurant._id,
          };
          await existingInvoice.save();
          console.log(`Updated restaurant_id for invoice ${existingInvoice._id}`);
        } else {
          console.log(`Restaurant not found for order group ${orderGroup._id}, skipping update.`);
        }
      } else {
        console.log(`Creating invoice for order group ${orderGroup._id}`);
        // Tạo req giả để truyền restaurant_id
        const mockReq = { user: { restaurant_id: orderGroup.restaurant_id } };
        await createInvoice(mockReq, orderGroup);
        console.log(`Invoice created successfully for order group ${orderGroup._id}`);
      }
    }

    console.log('Invoice synchronization completed.');
  } catch (error) {
    console.error('Error during invoice synchronization:', error);
  } finally {
    // Đóng kết nối sau khi hoàn tất
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

// Chạy script
syncInvoices();