import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import connectDB from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

connectDB();

async function updateMenuItemStatus() {
  try {
    const result = await MenuItem.updateMany(
      { status: { $exists: false } }, // Tìm document không có trường status
      { $set: { status: 'visible' } }, // Thêm trường status với giá trị mặc định 'visible'
      { runValidators: true }
    );
    console.log(`Cập nhật thành công: ${result.modifiedCount} document MenuItem đã được thêm trường status 'visible'.`);
  } catch (error) {
    console.error('Lỗi khi cập nhật status cho MenuItem:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateMenuItemStatus();