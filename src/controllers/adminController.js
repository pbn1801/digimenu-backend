import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import OrderGroup from '../models/OrderGroup.js';
import MenuItem from '../models/MenuItem.js';

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Admin access required
 */
const getAllUsers = asyncHandler(async (req, res) => {
  // Logic: Query User theo restaurant_id từ req.user, trả về danh sách người dùng
  const users = await User.find({ restaurant_id: req.user.restaurant_id })
    .select('-password')
    .sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
});

/**
 * @swagger
 * /admin/revenue:
 *   get:
 *     summary: Get total revenue for admin (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (yyyy-MM-dd)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (yyyy-MM-dd)
 *     responses:
 *       200:
 *         description: Total revenue
 *       400:
 *         description: Invalid date range
 *       403:
 *         description: Admin access required
 */
const getRevenue = asyncHandler(async (req, res) => {
  // Xác thực admin
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  // Lấy tham số từ query
  const { from, to } = req.query;

  // Xây dựng query
  let query = { restaurant_id: req.user.restaurant_id, payment_status: 'Đã thanh toán' };

  // Xử lý khoảng thời gian
  if (from || to) {
    const startDate = from ? new Date(from) : new Date(0); // Mặc định từ đầu nếu không có from
    const endDate = to ? new Date(to) : new Date(); // Mặc định đến hiện tại nếu không có to

    // Kiểm tra hợp lệ
    if (startDate > endDate) {
      res.status(400);
      throw new Error('Invalid date range: "from" must be before "to"');
    }

    query.payment_date = { $gte: startDate, $lte: endDate };
  }

  // Tính tổng doanh thu
  const result = await OrderGroup.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        total_revenue: { $sum: '$total_cost' },
        count: { $sum: 1 },
      },
    },
  ]);

  // Xử lý kết quả
  const total_revenue = result.length > 0 ? result[0].total_revenue : 0;
  const count = result.length > 0 ? result[0].count : 0;
  const period = from && to ? `${from} to ${to}` : 'all';

  res.status(200).json({
    success: true,
    total_revenue,
    count,
    period,
  });
});

/**
 * @swagger
 * /admin/popular-items:
 *   get:
 *     summary: Get popular menu items for admin (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of popular items to return
 *     responses:
 *       200:
 *         description: List of popular items
 *       400:
 *         description: Invalid limit value
 *       403:
 *         description: Admin access required
 */
const getPopularItems = asyncHandler(async (req, res) => {
  // Xác thực admin
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  // Lấy tham số từ query
  const { limit } = req.query;
  const parsedLimit = parseInt(limit, 10);

  // Kiểm tra limit hợp lệ
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    res.status(400);
    throw new Error('Invalid limit value: must be a positive number');
  }

  // Query menu items
  const popularItems = await MenuItem.find({ restaurant_id: req.user.restaurant_id })
    .select('name order_count price image_url') // Thêm image_url vào select
    .sort({ order_count: -1 })
    .limit(parsedLimit);

  res.status(200).json({
    success: true,
    count: popularItems.length,
    data: popularItems,
  });
});

export { getAllUsers, getRevenue, getPopularItems };