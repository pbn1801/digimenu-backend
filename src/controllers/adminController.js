import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Invoice from '../models/Invoice.js'; // Thay OrderGroup bằng Invoice
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
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { from, to } = req.query;

  let query = { 'restaurant_info.restaurant_id': req.user.restaurant_id }; // Sử dụng restaurant_info.restaurant_id

  if (from || to) {
    const startDate = from ? new Date(from) : new Date(0);
    const endDate = to ? new Date(to) : new Date();

    if (startDate > endDate) {
      res.status(400);
      throw new Error('Invalid date range: "from" must be before "to"');
    }

    query.payment_date = { $gte: startDate, $lte: endDate };
  }

  const result = await Invoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        total_revenue: { $sum: '$total_cost' },
        count: { $sum: 1 },
      },
    },
  ]);

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
 * /admin/revenue-by-day:
 *   get:
 *     summary: Get daily revenue for admin (Admin only)
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
 *         description: List of daily revenue
 *       400:
 *         description: Invalid date range
 *       403:
 *         description: Admin access required
 */
const getRevenueByDay = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { from, to } = req.query;

  let query = { 'restaurant_info.restaurant_id': req.user.restaurant_id }; // Sử dụng restaurant_info.restaurant_id

  if (from || to) {
    const startDate = from ? new Date(from) : new Date(0);
    const endDate = to ? new Date(to) : new Date();

    if (startDate > endDate) {
      res.status(400);
      throw new Error('Invalid date range: "from" must be before "to"');
    }

    query.payment_date = { $gte: startDate, $lte: endDate };
  }

  const result = await Invoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$payment_date' } },
        revenue: { $sum: '$total_cost' },
      },
    },
    { $sort: { '_id': 1 } },
  ]);

  const dailyRevenue = result.map(item => ({
    date: item._id,
    revenue: item.revenue || 0,
  }));

  res.status(200).json({
    success: true,
    count: dailyRevenue.length,
    data: dailyRevenue,
  });
});

/**
 * @swagger
 * /admin/revenue-by-month:
 *   get:
 *     summary: Get monthly revenue for admin by year (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of monthly revenue by year
 *       403:
 *         description: Admin access required
 */
const getRevenueByMonth = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  // Lấy tất cả dữ liệu doanh thu theo năm và tháng
  const result = await Invoice.aggregate([
    { $match: { 'restaurant_info.restaurant_id': req.user.restaurant_id } }, // Sử dụng restaurant_info.restaurant_id
    {
      $group: {
        _id: {
          year: { $year: '$payment_date' },
          month: { $month: '$payment_date' },
        },
        revenue: { $sum: '$total_cost' },
      },
    },
  ]);

  // Tạo mảng tháng cố định
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyData = {};

  // Tạo object chứa doanh thu theo năm và tháng
  result.forEach(item => {
    const year = item._id.year;
    const monthIndex = item._id.month - 1; // MongoDB month là 1-12, mảng là 0-11
    if (!monthlyData[monthIndex]) monthlyData[monthIndex] = {};
    monthlyData[monthIndex][year] = item.revenue || 0;
  });

  // Lấy danh sách các năm có dữ liệu
  const yearsWithData = [...new Set(result.map(item => item._id.year))];

  // Tạo mảng kết quả với 12 tháng, chỉ bao gồm các năm có dữ liệu
  const monthlyRevenue = months.map((month, index) => {
    const monthObj = { month };
    yearsWithData.forEach(year => {
      monthObj[year] = monthlyData[index]?.[year] || 0;
    });
    return monthObj;
  });

  res.status(200).json({
    success: true,
    count: monthlyRevenue.length,
    data: monthlyRevenue,
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
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { limit } = req.query;
  const parsedLimit = parseInt(limit, 10);

  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    res.status(400);
    throw new Error('Invalid limit value: must be a positive number');
  }

  const popularItems = await MenuItem.find({ restaurant_id: req.user.restaurant_id })
    .select('name order_count price image_url')
    .sort({ order_count: -1})
    .limit(parsedLimit);

  res.status(200).json({
    success: true,
    count: popularItems.length,
    data: popularItems,
  });
});

export { getAllUsers, getRevenue, getRevenueByDay, getRevenueByMonth, getPopularItems };