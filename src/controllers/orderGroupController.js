import asyncHandler from 'express-async-handler';
import OrderGroup from '../models/OrderGroup.js';
import Table from '../models/Table.js';
import { createInvoice } from './invoiceController.js';
import Invoice from '../models/Invoice.js'; // Thêm để populate
import MenuItem from '../models/MenuItem.js';
import api from '../utils/api.js'; // Import module API

/**
 * @swagger
 * /order-groups:
 *   get:
 *     summary: Get all order groups for staff (Staff or Admin only)
 *     tags: [OrderGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: ['Chưa thanh toán', 'Đã thanh toán']
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: List of order groups
 *       403:
 *         description: Staff or Admin access required
 */
const getOrderGroups = asyncHandler(async (req, res) => {
  const { payment_status } = req.query;

  let query = {
    restaurant_id: req.user.restaurant_id,
  };

  if (payment_status) {
    query.payment_status = payment_status;
  }

  const orderGroups = await OrderGroup.find(query)
    .populate('table_id', 'name table_number')
    .populate({
      path: 'orders',
      populate: {
        path: 'items.item_id',
        select: 'restaurant_id name price description image_url category_id order_count',
      },
    })
    .sort(payment_status === 'Đã thanh toán' ? { payment_date: -1 } : { createdAt: -1 });

  let filteredOrderGroups = orderGroups;
  if (payment_status === 'Chưa thanh toán') {
    filteredOrderGroups = orderGroups.filter(orderGroup =>
      orderGroup.orders.some(order => order.status === 'Đã nhận')
    );
  }

  res.status(200).json({
    success: true,
    count: filteredOrderGroups.length,
    data: filteredOrderGroups,
  });
});

/**
 * @swagger
 * /order-groups/{id}/pay:
 *   put:
 *     summary: Update an order group payment status (Staff or Admin only)
 *     tags: [OrderGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               payment_method:
 *                 type: string
 *                 enum: ['QR', 'Tiền mặt']
 *     responses:
 *       200:
 *         description: Order group updated
 *       404:
 *         description: Order group not found
 *       403:
 *         description: Staff or Admin access required
 */
const updateOrderGroup = asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  try {
    const { payment_method } = req.body;

    const orderGroup = await OrderGroup.findOne({
      _id: req.params.id,
      restaurant_id: req.user.restaurant_id,
    });

    if (!orderGroup) {
      io.emit('error_notification', {
        error_type: 'OrderGroupNotFound',
        message: 'Order group not found',
        related_id: req.params.id,
        timestamp: new Date().toISOString(),
      });
      res.status(404);
      throw new Error('Order group not found');
    }

    const oldPaymentStatus = orderGroup.payment_status;

    if (payment_method) {
      orderGroup.payment_method = payment_method;
      orderGroup.payment_status = 'Đã thanh toán';
      orderGroup.payment_date = new Date();
    }

    await orderGroup.save();

    const table = await Table.findById(orderGroup.table_id);
    if (table) {
      const previousStatus = table.status;
      table.current_order_group = null;
      table.status = 'Trống';
      await table.save();

      io.emit('table_status_updated', {
        table_id: table._id,
        name: table.name,
        table_number: table.name,
        status: table.status,
        previous_status: previousStatus,
        timestamp: new Date().toISOString(),
      });
    }

    const populatedOrderGroup = await OrderGroup.findById(orderGroup._id)
      .populate('table_id', 'name table_number')
      .populate({
        path: 'orders',
        populate: {
          path: 'items.item_id',
          select: 'restaurant_id name price description image_url category_id order_count',
        },
      });

    // Cập nhật order_count cho các MenuItem
    const itemCounts = {};
    for (const order of populatedOrderGroup.orders) {
      for (const item of order.items) {
        const itemId = item.item_id._id.toString();
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

    io.emit('order_group_updated', populatedOrderGroup);

    let invoice;
    if (orderGroup.payment_status === 'Đã thanh toán' && oldPaymentStatus !== 'Đã thanh toán') {
      try {
        invoice = await createInvoice(req, orderGroup);
      } catch (invoiceError) {
        io.emit('error_notification', {
          error_type: 'InvoiceCreationFailed',
          message: invoiceError.message || 'Failed to create invoice',
          related_id: orderGroup._id.toString(),
          timestamp: new Date().toISOString(),
        });
        throw new Error('Failed to create invoice');
      }
    }

    if (invoice) {
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('table_id', 'name table_number');
      io.emit('invoice_created', {
        _id: populatedInvoice._id,
        invoice_number: populatedInvoice.invoice_number,
        table_id: populatedInvoice.table_id,
        total_cost: populatedInvoice.total_cost,
        payment_date: populatedInvoice.payment_date,
      });
    }

    res.status(200).json({
      success: true,
      data: orderGroup,
    });
  } catch (error) {
    io.emit('error_notification', {
      error_type: 'GeneralError',
      message: error.message || 'An unexpected error occurred',
      related_id: req.params.id || 'N/A',
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
});

/**
 * @swagger
 * /order-groups/{id}:
 *   get:
 *     summary: Get order group details by ID (Staff or Admin only)
 *     tags: [OrderGroups]
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
 *         description: Order group details
 *       404:
 *         description: Order group not found
 *       403:
 *         description: Staff or Admin access required
 */
const getOrderGroupById = asyncHandler(async (req, res) => {
  const orderGroup = await OrderGroup.findOne({
    _id: req.params.id,
    restaurant_id: req.user.restaurant_id,
  })
    .populate('table_id', 'name table_number')
    .populate({
      path: 'orders',
      populate: {
        path: 'items.item_id',
        select: 'restaurant_id name price description image_url category_id order_count',
      },
    });

  if (!orderGroup) {
    res.status(404);
    throw new Error('Order group not found');
  }

  res.status(200).json({
    success: true,
    data: orderGroup,
  });
});

/**
 * @swagger
 * /order-groups/table/{name}:
 *   get:
 *     summary: Get the current unpaid order group for a table by name (Staff or Admin only)
 *     tags: [OrderGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: number
 *         description: Table number (e.g., 1, 2, 3)
 *     responses:
 *       200:
 *         description: Unpaid order group details
 *       404:
 *         description: Table or unpaid order group not found
 *       403:
 *         description: Staff or Admin access required
 */
const getOrderGroupByTableName = asyncHandler(async (req, res) => {
  const { name } = req.params;

  // Validate that name is an integer
  if (!Number.isInteger(Number(name))) {
    res.status(400);
    throw new Error('Name must be an integer');
  }

  // Find table by name
  const table = await Table.findOne({ name: Number(name) })
    .populate('restaurant_id', 'name slug');

  if (!table) {
    res.status(404);
    throw new Error('Table not found');
  }

  // Check if table belongs to the user's restaurant
  if (table.restaurant_id._id.toString() !== req.user.restaurant_id.toString()) {
    res.status(403);
    throw new Error('Table does not belong to your restaurant');
  }

  // Find the current OrderGroup if it exists and is not paid
  let orderGroup = null;
  if (table.current_order_group) {
    orderGroup = await OrderGroup.findOne({
      _id: table.current_order_group,
      payment_status: 'Chưa thanh toán',
      restaurant_id: req.user.restaurant_id,
    }).populate({
      path: 'orders',
      populate: {
        path: 'items.item_id',
        select: 'name price description image_url category_id order_count',
      },
    });
  }

  if (!orderGroup) {
    return res.status(200).json({
      success: true,
      message: 'No unpaid order group found for this table',
      data: null,
    });
  }

  // Sort orders by createdAt (ascending)
  const orders = orderGroup.orders.sort((a, b) => a.createdAt - b.createdAt);

  res.status(200).json({
    success: true,
    data: {
      table: {
        _id: table._id,
        name: table.name,
        status: table.status,
      },
      order_group: {
        _id: orderGroup._id,
        total_amount: orderGroup.total_amount,
        payment_status: orderGroup.payment_status,
        payment_method: orderGroup.payment_method,
        orders: orders,
      },
    },
  });
});

/**
 * @swagger
 * /order-groups/{id}/create-qr:
 *   post:
 *     summary: Create QR code for an order group payment (Staff or Admin only)
 *     tags: [OrderGroups]
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
 *         description: QR code URL created successfully
 *       404:
 *         description: Order group not found
 *       403:
 *         description: Staff or Admin access required
 */
const createQrForOrderGroup = asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  const orderGroup = await OrderGroup.findOne({
    _id: req.params.id,
    restaurant_id: req.user.restaurant_id,
  });

  if (!orderGroup) {
    io.emit('error_notification', {
      error_type: 'OrderGroupNotFound',
      message: 'Order group not found',
      related_id: req.params.id,
      timestamp: new Date().toISOString(),
    });
    res.status(404);
    throw new Error('Order group not found');
  }

  if (orderGroup.payment_status === 'Đã thanh toán') {
    io.emit('error_notification', {
      error_type: 'PaymentAlreadyProcessed',
      message: 'Order group already paid',
      related_id: req.params.id,
      timestamp: new Date().toISOString(),
    });
    res.status(400);
    throw new Error('Order group already paid');
  }

  // Tạo URL QR động với VA ảo và total_cost
  const qr_code_url = `https://qr.sepay.vn/img?acc=96247PBN18&bank=BIDV&amount=${orderGroup.total_cost}&des=Thanh%20toan%20don%20${orderGroup._id.toString()}`;

  res.status(200).json({
    success: true,
    data: { qr_code_url },
  });
});

export { getOrderGroups, updateOrderGroup, getOrderGroupById, getOrderGroupByTableName, createQrForOrderGroup };