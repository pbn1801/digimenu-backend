import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';

// Hàm kiểm tra định dạng email
const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user and return a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Invalid email format
 */
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    res.status(400);
    throw new Error('Invalid email format');
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  console.log('User found:', user);
  console.log('Entered password:', password);
  console.log('Hashed password in DB:', user.password);

  const isMatch = await user.matchPassword(password);
  console.log('Password match:', isMatch);

  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  console.log('JWT_SECRET in login:', process.env.JWT_SECRET);

  const token = jwt.sign(
    { id: user._id, role: user.role, restaurant_id: user.restaurant_id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      email: user.email,
      phone_number: user.phone_number,
      restaurant_id: user.restaurant_id,
    },
  });
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new admin and restaurant
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               email: { type: string }
 *               phone_number: { type: string }
 *               restaurant:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   address: { type: string }
 *                   phone: { type: string }
 *     responses:
 *       201:
 *         description: Admin and restaurant created
 *       400:
 *         description: Bad request or invalid email format
 */
const registerAdmin = asyncHandler(async (req, res) => {
  const { username, password, email, phone_number, restaurant } = req.body;

  if (!username || !password || !email || !phone_number || !restaurant) {
    res.status(400);
    throw new Error('All fields are required');
  }

  if (!restaurant.name || !restaurant.address || !restaurant.phone) {
    res.status(400);
    throw new Error('Restaurant name, address, and phone are required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    res.status(400);
    throw new Error('Invalid email format');
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

  const newRestaurant = await Restaurant.create({
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
  });

  const adminUser = await User.create({
    username,
    password,
    email,
    phone_number,
    role: 'admin',
    restaurant_id: newRestaurant._id,
  });

  const token = jwt.sign(
    {
      id: adminUser._id,
      role: adminUser.role,
      restaurant_id: adminUser.restaurant_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.status(201).json({
    success: true,
    token,
    user: {
      id: adminUser._id,
      username: adminUser.username,
      role: adminUser.role,
      email: adminUser.email,
      phone_number: adminUser.phone_number,
      restaurant_id: adminUser.restaurant_id,
    },
    restaurant: {
      id: newRestaurant._id,
      name: newRestaurant.name,
      address: newRestaurant.address,
      phone: newRestaurant.phone,
    },
  });
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user's information (Staff or Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *       401:
 *         description: Not authorized
 */
const getCurrentUser = asyncHandler(async (req, res) => {
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

export { loginUser, registerAdmin, getCurrentUser };