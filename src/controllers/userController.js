import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

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

export { getAllUsers };