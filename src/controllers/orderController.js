import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import MenuItem from '../models/MenuItem.js';
import OrderGroup from '../models/OrderGroup.js';

/**
 * @swagger
 * /orders/add:
 *   post:
 *     summary: Add a new order (Public)
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               table_id:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_id:
 *                       type: string
 *                     quantity:
 *                       type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created
 *       400:
 *         description: Bad request
 *       404:
 *         description: Table or menu item not found
 */
const addOrder = asyncHandler(async (req, res) => {
  const { table_id, items, notes } = req.body;

  // Validate required fields
  if (!table_id || !items || items.length === 0) {
    res.status(400);
    throw new Error('Table ID and items are required');
  }

  // Check table
  const table = await Table.findById(table_id);
  if (!table) {
    res.status(404);
    throw new Error('Table not found');
  }

  // Validate items and calculate total_cost
  let total_cost = 0;
  const updatedItems = [];
  for (const item of items) {
    const menuItem = await MenuItem.findById(item.item_id);
    if (!menuItem) {
      res.status(404);
      throw new Error(`Menu item ${item.item_id} not found`);
    }

    // Mặc định quantity là 1 nếu không được cung cấp hoặc không hợp lệ
    let quantity = item.quantity;
    if (!quantity || quantity < 1) {
      quantity = 1;
    }

    // Lấy price từ MenuItem
    const price = menuItem.price;
    if (price < 0) {
      res.status(400);
      throw new Error(`Price of menu item ${item.item_id} must be a positive number`);
    }

    // Tính tổng tiền cho item này
    const itemTotal = quantity * price;
    total_cost += itemTotal;

    // Thêm price và quantity đã xử lý vào item để lưu vào Order
    updatedItems.push({
      item_id: item.item_id,
      quantity: quantity,
      price: price,
    });
  }

  // Check or create OrderGroup
  let orderGroup = await OrderGroup.findById(table.current_order_group);
  if (!orderGroup || orderGroup.payment_status === 'Đã thanh toán') {
    orderGroup = await OrderGroup.create({
      restaurant_id: table.restaurant_id,
      table_id,
      payment_status: 'Chưa thanh toán',
    });
    table.current_order_group = orderGroup._id;
    table.status = 'Đang sử dụng';
    await table.save();
  }

  // Create new order
  const order = await Order.create({
    restaurant_id: table.restaurant_id,
    table_id,
    order_group_id: orderGroup._id,
    items: updatedItems,
    total_cost,
    notes: notes || '',
    status: 'Đang chờ',
  });

  // Update OrderGroup
  orderGroup.orders.push(order._id);
  orderGroup.total_cost += total_cost;
  await orderGroup.save();

  // WebSocket event
  const io = req.app.get('io');
  if (!io) {
    console.error('Socket.IO not initialized');
    res.status(500);
    throw new Error('Internal server error');
  }
  const populatedOrder = await Order.findById(order._id)
    .populate('table_id', 'name table_number')
    .populate('items.item_id', 'restaurant_id name price description image_url category_id order_count');
  const roomName = `room_table_${table_id}`;
  const timestamp = new Date().toISOString();

  console.log(`Emitting 'new_order' to room: ${roomName}`);
  io.to(roomName).emit('new_order', {
    type: 'new_order',
    target: 'staff',
    message: `Có đơn mới tại bàn số ${table.name || table_id}`,
    data: populatedOrder,
    timestamp: timestamp,
  });

  console.log(`Emitting 'customer_notification' to room: ${roomName}`);
  io.to(roomName).emit('customer_notification', {
    type: 'order_submitted',
    target: 'customer',
    message: 'Đơn đã được gửi và đang chờ xử lý',
    data: populatedOrder,
    timestamp: timestamp,
  });

  res.status(201).json({
    success: true,
    data: order,
  });
});

/**
 * @swagger
 * /orders/pending:
 *   get:
 *     summary: Get all pending orders for staff (Staff or Admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending orders
 *       403:
 *         description: Staff or Admin access required
 */
const getPendingOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    restaurant_id: req.user.restaurant_id,
    status: 'Đang chờ',
  })
    .populate('table_id', 'name table_number')
    .populate('items.item_id', 'restaurant_id name price description image_url category_id order_count')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

/**
 * @swagger
 * /orders/{id}/approve:
 *   put:
 *     summary: Approve an order (Staff or Admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order approved
 *       404:
 *         description: Order not found
 *       403:
 *         description: Staff or Admin access required
 */
const approveOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    restaurant_id: req.user.restaurant_id,
  });

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.status = 'Đã nhận';
  await order.save();

  const io = req.app.get('io');
  const populatedOrder = await Order.findById(order._id)
    .populate('table_id', 'name table_number')
    .populate('items.item_id', 'name price');
  const roomName = `room_table_${order.table_id}`;
  const timestamp = new Date().toISOString();

  io.to(roomName).emit('customer_notification', {
    type: 'order_approved',
    target: 'customer',
    message: 'Đơn của bạn đã được duyệt',
    data: populatedOrder,
    timestamp: timestamp,
  });

  res.status(200).json({
    success: true,
    data: order,
  });
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders (pending and approved) for staff (Staff or Admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all orders
 *       403:
 *         description: Staff or Admin access required
 */
const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    restaurant_id: req.user.restaurant_id,
  })
    .populate('table_id', 'name table_number')
    .populate('items.item_id', 'restaurant_id name price description image_url category_id order_count')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

/**
 * @swagger
 * /orders/approved:
 *   get:
 *     summary: Get all approved orders for staff (Staff or Admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of approved orders
 *       403:
 *         description: Staff or Admin access required
 */
const getApprovedOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    restaurant_id: req.user.restaurant_id,
    status: 'Đã nhận',
  })
    .populate('table_id', 'name table_number')
    .populate('items.item_id', 'restaurant_id name price description image_url category_id order_count')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

export { addOrder, getPendingOrders, approveOrder, getAllOrders, getApprovedOrders };