import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

// Hàm kiểm tra định dạng email
const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// Hàm kiểm tra định dạng số điện thoại
const validatePhoneNumber = (phone) => {
  if (!phone) return true; // Cho phép rỗng
  const phoneRegex = /^\d{10,11}$/;
  return phoneRegex.test(phone);
};

/**
 * @swagger
 * /users/add:
 *   post:
 *     summary: Create a new user (admin or staff) by admin
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               email: { type: string }
 *               phone_number: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: ['admin', 'staff'], default: 'staff' }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Bad request or invalid email/phone format
 *       403:
 *         description: Admin access required
 */
const createUser = asyncHandler(async (req, res) => {
  const { username, email, phone_number, password, role = 'staff' } = req.body;

  if (!username || !email || !password) {
    res.status(400);
    throw new Error('Username, email, and password are required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    res.status(400);
    throw new Error('Invalid email format');
  }

  // Validate phone number format (if provided)
  if (phone_number && !validatePhoneNumber(phone_number)) {
    res.status(400);
    throw new Error('Invalid phone number format (10-11 digits allowed)');
  }

  const userExists = await User.findOne({ username });
  if (userExists) {
    res.status(400);
    throw new Error('Username already exists');
  }

  const emailExists = await User.findOne({ email });
  if (emailExists) {
    res.status(400);
    throw new Error('Email already exists');
  }

  const restaurant_id = req.user.restaurant_id;
  if (!restaurant_id) {
    res.status(400);
    throw new Error('Restaurant not associated with admin');
  }

  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const user = await User.create({
    username,
    email,
    phone_number,
    password,
    role,
    restaurant_id,
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id,
      username: user.username,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      restaurant_id: user.restaurant_id,
    },
  });
});

/**
 * @swagger
 * /users/view:
 *   get:
 *     summary: Get all users (admin and staff) in the same restaurant
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Admin access required
 */
const getUsers = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const restaurant_id = req.user.restaurant_id;
  const users = await User.find({ restaurant_id }).select('-password');
  res.status(200).json({
    success: true,
    data: users,
  });
});

/**
 * @swagger
 * /users/view/{id}:
 *   get:
 *     summary: Get user details by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
const getUserById = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const user = await User.findById(req.params.id).select('-password');
  if (!user || user.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
    res.status(404);
    throw new Error('User not found');
  }
  res.status(200).json({
    success: true,
    data: user,
  });
});

/**
 * @swagger
 * /users/edit/{id}:
 *   put:
 *     summary: Update user (admin or staff) by admin
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               email: { type: string }
 *               phone_number: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: ['admin', 'staff'] }
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Bad request or invalid email/phone format
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
const updateUser = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { username, email, phone_number, password, role } = req.body;
  const user = await User.findById(req.params.id);

  if (!user || user.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
    res.status(404);
    throw new Error('User not found');
  }

  if (username) {
    const userExists = await User.findOne({ username, _id: { $ne: user._id } });
    if (userExists) {
      res.status(400);
      throw new Error('Username already exists');
    }
    user.username = username;
  }

  if (email) {
    if (!validateEmail(email)) {
      res.status(400);
      throw new Error('Invalid email format');
    }
    const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
    if (emailExists) {
      res.status(400);
      throw new Error('Email already exists');
    }
    user.email = email;
  }

  if (phone_number) {
    if (!validatePhoneNumber(phone_number)) {
      res.status(400);
      throw new Error('Invalid phone number format (10-11 digits allowed)');
    }
    user.phone_number = phone_number;
  }

  if (password) user.password = password;
  if (role && ['admin', 'staff'].includes(role)) user.role = role;

  const updatedUser = await user.save();
  res.status(200).json({
    success: true,
    data: {
      id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      phone_number: updatedUser.phone_number,
      role: updatedUser.role,
      restaurant_id: updatedUser.restaurant_id,
    },
  });
});

/**
 * @swagger
 * /users/delete/{id}:
 *   delete:
 *     summary: Delete user (admin or staff) by admin
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
const deleteUser = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Admin access required');
  }

  const user = await User.findById(req.params.id);

  if (!user || user.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
    res.status(404);
    throw new Error('User not found');
  }

  await User.findByIdAndDelete(req.params.id);
  res.status(200).json({
    success: true,
    data: {},
  });
});

export { createUser, getUsers, getUserById, updateUser, deleteUser };