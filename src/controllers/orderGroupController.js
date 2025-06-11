import asyncHandler from 'express-async-handler';
import OrderGroup from '../models/OrderGroup.js';
import Table from '../models/Table.js';
import { createInvoice } from './invoiceController.js';
import Invoice from '../models/Invoice.js'; // Thêm để populate

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

export { getOrderGroups, updateOrderGroup, getOrderGroupById };