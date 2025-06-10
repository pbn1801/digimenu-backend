import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current user's information (Staff or Admin only)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *       401:
 *         description: Not authorized
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  // Logic: Dùng req.user từ middleware protect, trả về thông tin người dùng hiện tại
  res.status(200).json({
    success: true,
    data: {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role,
      email: req.user.email,
      phone_number: req.user.phone_number,
      restaurant_id: req.user.restaurant_id,
    },
  });
});

export { getCurrentUser };