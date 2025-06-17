import asyncHandler from 'express-async-handler';
import OrderGroup from '../models/OrderGroup.js';
import Table from '../models/Table.js';
import { createInvoice } from './invoiceController.js';
import Invoice from '../models/Invoice.js'; // Thêm để populate
import MenuItem from '../models/MenuItem.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Hàm chung xử lý thành công thanh toán
 */
const processPaymentSuccess = async (orderGroup, io, req) => {
  const populatedOrderGroup = await OrderGroup.findById(orderGroup._id)
    .populate('table_id', 'name table_number')
    .populate({
      path: 'orders',
      populate: {
        path: 'items.item_id',
        select: 'restaurant_id name price description image_url category_id order_count',
      },
    });

  const table = await Table.findById(orderGroup.table_id);
  if (table) {
    const previousStatus = table.status;
    table.current_order_group = null;
    table.status = 'Trống';
    await table.save();

    io.emit('table_status_updated', {
      table_id: table._id,
      name: table.name,
      table_number: table.table_number,
      status: table.status,
      previous_status: previousStatus,
      timestamp: new Date().toISOString(),
    });
  }

  // Chỉ tăng order_count nếu payment_status là 'Đã thanh toán' và chưa được xử lý trước đó
  if (orderGroup.payment_status === 'Đã thanh toán' && !orderGroup.isOrderCountProcessed) {
    const itemCounts = {};
    for (const order of populatedOrderGroup.orders || []) {
      for (const item of order.items || []) {
        const itemId = item.item_id?._id?.toString();
        if (itemId) {
          itemCounts[itemId] = (itemCounts[itemId] || 0) + (item.quantity || 1);
        }
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
    // Đánh dấu rằng order_count đã được xử lý
    orderGroup.isOrderCountProcessed = true;
    await orderGroup.save();
  }

  let invoice;
  if (orderGroup.payment_status === 'Đã thanh toán') {
    try {
      invoice = await createInvoice(req, orderGroup);
    } catch (invoiceError) {
      io.to('staff_room').emit('error_notification', {
        error_type: 'InvoiceCreationFailed',
        message: invoiceError.message || 'Failed to create invoice',
        related_id: orderGroup._id.toString(),
        timestamp: new Date().toISOString(),
      });
      throw new Error('Failed to create invoice');
    }
  }

  if (invoice) {
    const populatedInvoice = await Invoice.findById(invoice._id).populate('table_id', 'name table_number');
    io.emit('invoice_created', {
      _id: populatedInvoice._id,
      invoice_number: populatedInvoice.invoice_number,
      table_id: populatedInvoice.table_id,
      total_cost: populatedInvoice.total_cost,
      payment_date: populatedInvoice.payment_date,
    });
  }
};

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
 *         description: List of order groups with aggregated items
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
      orderGroup.orders && orderGroup.orders.some(order => order.status === 'Đã nhận')
    );
  }

  const result = filteredOrderGroups.map(orderGroup => {
    const aggregatedItems = {};
    let totalCost = 0;

    if (orderGroup.orders) {
      orderGroup.orders.forEach(order => {
        if (order && order.total_cost) {
          totalCost += order.total_cost;
        }
        if (order && order.items) {
          order.items.forEach(item => {
            if (item && item.item_id && item.price) {
              const itemId = item.item_id._id?.toString();
              if (itemId) {
                if (!aggregatedItems[itemId]) {
                  aggregatedItems[itemId] = {
                    item_id: item.item_id,
                    quantity: 0,
                    price: item.price,
                  };
                }
                aggregatedItems[itemId].quantity += item.quantity || 1;
              }
            }
          });
        }
      });
    }

    return {
      table: orderGroup.table_id,
      order_group: {
        _id: orderGroup._id,
        total_cost: totalCost,
        payment_status: orderGroup.payment_status,
        payment_method: orderGroup.payment_method,
        items: Object.values(aggregatedItems),
        createdAt: orderGroup.createdAt,
        updatedAt: orderGroup.updatedAt,
        __v: orderGroup.__v,
      },
    };
  });

  res.status(200).json({
    success: true,
    count: result.length,
    data: result,
  });
});

/**
 * @swagger
 * /order-groups/{id}/pay:
 *   put:
 *     summary: Update an order group payment status with cash (Staff or Admin only)
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
 *         description: Order group updated
 *       404:
 *         description: Order group not found
 *       403:
 *         description: Staff or Admin access required
 *       400:
 *         description: Invalid payment method or already paid
 */
const updateOrderGroup = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const finalPaymentMethod = 'Tiền mặt'; // Mặc định payment_method là Tiền mặt

  // Tìm OrderGroup
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

  // Kiểm tra trạng thái trước khi cập nhật
  const oldPaymentStatus = orderGroup.payment_status;
  if (oldPaymentStatus === 'Đã thanh toán') {
    io.emit('error_notification', {
      error_type: 'PaymentAlreadyProcessed',
      message: 'Order group already paid',
      related_id: req.params.id,
      timestamp: new Date().toISOString(),
    });
    return res.status(400).json({
      success: false,
      message: 'Order group already paid',
    });
  }

  // Cập nhật trạng thái
  orderGroup.payment_method = finalPaymentMethod;
  orderGroup.payment_status = 'Đã thanh toán';
  orderGroup.payment_date = new Date();
  await orderGroup.save();

  // Gọi hàm chung xử lý thành công
  await processPaymentSuccess(orderGroup, io, req);

  const populatedOrderGroup = await OrderGroup.findById(orderGroup._id)
    .populate('table_id', 'name table_number')
    .populate({
      path: 'orders',
      populate: {
        path: 'items.item_id',
        select: 'restaurant_id name price description image_url category_id order_count',
      },
    });

  const aggregatedItems = {};
  let totalCost = 0;
  if (populatedOrderGroup.orders) {
    populatedOrderGroup.orders.forEach(order => {
      if (order && order.total_cost) {
        totalCost += order.total_cost;
      }
      if (order && order.items) {
        order.items.forEach(item => {
          if (item && item.item_id && item.price) {
            const itemId = item.item_id._id?.toString();
            if (itemId) {
              if (!aggregatedItems[itemId]) {
                aggregatedItems[itemId] = {
                  item_id: item.item_id,
                  quantity: 0,
                  price: item.price,
                };
              }
              aggregatedItems[itemId].quantity += item.quantity || 1;
            }
          }
        });
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      table: populatedOrderGroup.table_id,
      order_group: {
        _id: populatedOrderGroup._id,
        total_cost: totalCost,
        payment_status: populatedOrderGroup.payment_status,
        payment_method: populatedOrderGroup.payment_method,
        items: Object.values(aggregatedItems),
        createdAt: populatedOrderGroup.createdAt,
        updatedAt: populatedOrderGroup.updatedAt,
        __v: populatedOrderGroup.__v,
      },
    },
  });
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
 *         description: Order group details with aggregated items
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

  const aggregatedItems = {};
  let totalCost = 0;
  if (orderGroup.orders) {
    orderGroup.orders.forEach(order => {
      if (order && order.total_cost) {
        totalCost += order.total_cost;
      }
      if (order && order.items) {
        order.items.forEach(item => {
          if (item && item.item_id && item.price) {
            const itemId = item.item_id._id?.toString();
            if (itemId) {
              if (!aggregatedItems[itemId]) {
                aggregatedItems[itemId] = {
                  item_id: item.item_id,
                  quantity: 0,
                  price: item.price,
                };
              }
              aggregatedItems[itemId].quantity += item.quantity || 1;
            }
          }
        });
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      table: orderGroup.table_id,
      order_group: {
        _id: orderGroup._id,
        total_cost: totalCost,
        payment_status: orderGroup.payment_status,
        payment_method: orderGroup.payment_method,
        items: Object.values(aggregatedItems),
        createdAt: orderGroup.createdAt,
        updatedAt: orderGroup.updatedAt,
        __v: orderGroup.__v,
      },
    },
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
 *         description: Unpaid order group details with aggregated items
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

  const aggregatedItems = {};
  let totalCost = 0;
  if (orderGroup.orders) {
    orderGroup.orders.forEach(order => {
      if (order && order.total_cost) {
        totalCost += order.total_cost;
      }
      if (order && order.items) {
        order.items.forEach(item => {
          if (item && item.item_id && item.price) {
            const itemId = item.item_id._id.toString();
            if (itemId) {
              if (!aggregatedItems[itemId]) {
                aggregatedItems[itemId] = {
                  item_id: item.item_id,
                  quantity: 0,
                  price: item.price,
                };
              }
              aggregatedItems[itemId].quantity += item.quantity || 1;
            }
          }
        });
      }
    });
  }

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
        total_cost: totalCost,
        payment_status: orderGroup.payment_status,
        payment_method: orderGroup.payment_method,
        items: Object.values(aggregatedItems),
        createdAt: orderGroup.createdAt,
        updatedAt: orderGroup.updatedAt,
        __v: orderGroup.__v,
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
 *       400:
 *         description: Order group already paid
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

  // Tạo URL QR với tham chiếu orderGroup._id
  const qr_code_url = `https://qr.sepay.vn/img?acc=4711738273&bank=BIDV&amount=${orderGroup.total_cost}&des=Thanh%20toan%20don%20${orderGroup._id.toString()}`;

  res.status(200).json({
    success: true,
    data: { qr_code_url },
  });
});

/**
 * @swagger
 * /webhook/payment:
 *   post:
 *     summary: Handle SePay webhook payment notification
 *     tags: [OrderGroups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: SePay transaction ID
 *               transferAmount:
 *                 type: number
 *                 description: Transaction amount
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Transaction date and time
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number
 *               transferType:
 *                 type: string
 *                 description: Transaction type (in/out)
 *               content:
 *                 type: string
 *                 description: Transaction content
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid payload or mismatch
 */
const webhookPayment = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { id, transferAmount, transactionDate, accountNumber, transferType, content } = req.body;

  console.log('Webhook payload received:', { id, transferAmount, transactionDate, accountNumber, transferType, content });

  if (!id || !transferAmount || !transactionDate || !accountNumber || transferType !== 'in') {
    res.status(400);
    throw new Error('Invalid webhook payload');
  }

  const validAccountNumber = process.env.VA_ACCOUNT_NUMBER || '4711738273';
  if (accountNumber !== validAccountNumber) {
    res.status(400);
    throw new Error('Invalid account number');
  }

  const orderGroupIdMatch = content.match(/Thanh\s*toan\s*don\s*([0-9a-fA-F]{24})/);
  if (!orderGroupIdMatch) {
    io.to('staff_room').emit('error_notification', {
      error_type: 'OrderGroupIdNotFound',
      message: 'No order group ID found in transaction content',
      related_id: id.toString(),
      timestamp: new Date().toISOString(),
    });
    res.status(400);
    throw new Error('No order group ID found in transaction content');
  }
  const orderGroupId = orderGroupIdMatch[1];

  const orderGroup = await OrderGroup.findOne({
    _id: orderGroupId,
    payment_status: 'Chưa thanh toán',
  }).populate('table_id', 'table_number');

  if (!orderGroup) {
    io.to('staff_room').emit('error_notification', {
      error_type: 'OrderGroupNotFound',
      message: 'No matching unpaid order group found',
      related_id: orderGroupId,
      timestamp: new Date().toISOString(),
    });
    res.status(400);
    throw new Error('No matching unpaid order group found');
  }

  if (orderGroup.total_cost !== transferAmount) {
    io.to('staff_room').emit('error_notification', {
      error_type: 'AmountMismatch',
      message: `Transfer amount (${transferAmount}) does not match order total (${orderGroup.total_cost})`,
      related_id: orderGroupId,
      timestamp: new Date().toISOString(),
    });
    res.status(400);
    throw new Error('Transfer amount does not match order total');
  }

  orderGroup.payment_method = 'QR';
  orderGroup.payment_status = 'Đã thanh toán';
  orderGroup.payment_date = new Date(transactionDate);
  await orderGroup.save();

  await processPaymentSuccess(orderGroup, io, req);

  const tableNumber = orderGroup.table_id ? orderGroup.table_id.table_number : 'Unknown';
  io.to('staff_room').emit('payment_success', {
    orderGroupId,
    tableNumber,
    amount: transferAmount,
    message: `Đơn hàng đã được thanh toán thành công với ${transferAmount} VND.`,
  });
  console.log(`Emitted payment_success event to staff_room for orderGroupId: ${orderGroupId}`);

  res.status(200).json({ success: true });
});

export {
  getOrderGroups,
  updateOrderGroup,
  getOrderGroupById,
  getOrderGroupByTableName,
  createQrForOrderGroup,
  webhookPayment,
};