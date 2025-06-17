import asyncHandler from 'express-async-handler';
import Invoice from '../models/Invoice.js';
import Restaurant from '../models/Restaurant.js';
import { getNextSequenceValue, getInvoiceNumber } from '../utils/counterLogic.js';
import OrderGroup from '../models/OrderGroup.js';

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: Get all invoices (Public)
 *     tags: [Invoices]
 *     parameters:
 *       - in: query
 *         name: table_id
 *         schema:
 *           type: string
 *         description: Filter by table ID
 *       - in: query
 *         name: payment_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by payment date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of invoices with aggregated items
 *       400:
 *         description: Invalid payment date format
 *       500:
 *         description: Internal server error
 */
const getInvoices = asyncHandler(async (req, res) => {
  const { table_id, payment_date } = req.query;

  let query = {};

  // Lọc theo table_id nếu có
  if (table_id) {
    query.table_id = table_id;
  }

  // Lọc theo payment_date nếu có (YYYY-MM-DD)
  if (payment_date) {
    const dateInput = new Date(payment_date);
    if (isNaN(dateInput.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment date format. Use YYYY-MM-DD',
      });
    }
    const start = new Date(dateInput.setHours(0, 0, 0, 0));
    const end = new Date(dateInput.setHours(23, 59, 59, 999));
    query.payment_date = { $gte: start, $lte: end };
  }

  const invoices = await Invoice.find(query)
    .populate('table_id', 'name table_number')
    .populate({
      path: 'order_group_id',
      match: { payment_status: 'Đã thanh toán' }, // Chỉ lấy order group đã thanh toán
      populate: {
        path: 'orders',
        populate: { path: 'items.item_id', select: 'name price description image_url category_id order_count' },
      },
    })
    .sort({ payment_date: -1 });

  // Lọc ra các invoice có order_group_id hợp lệ
  const validInvoices = invoices.filter(invoice => invoice.order_group_id !== null);

  const result = validInvoices.map(invoice => {
    const orderGroup = invoice.order_group_id;
    if (!orderGroup) {
      return null; // Bỏ qua nếu order_group_id không hợp lệ
    }
    const aggregatedItems = {};
    let totalCost = orderGroup.total_cost || 0;

    orderGroup.orders.forEach(order => {
      order.items.forEach(item => {
        const itemId = item.item_id?._id?.toString();
        if (itemId) {
          if (!aggregatedItems[itemId]) {
            aggregatedItems[itemId] = {
              item_id: item.item_id,
              quantity: 0,
              price: item.price || 0,
            };
          }
          aggregatedItems[itemId].quantity += item.quantity || 1;
        }
      });
    });

    return {
      _id: invoice._id,
      invoice_number: invoice.invoice_number,
      table_id: invoice.table_id,
      total_cost: totalCost,
      payment_method: invoice.payment_method,
      payment_date: invoice.payment_date,
      restaurant_info: invoice.restaurant_info,
      order_group_id: {
        _id: orderGroup._id,
        total_cost: totalCost,
        items: Object.values(aggregatedItems),
      },
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      __v: invoice.__v,
    };
  }).filter(item => item !== null); // Loại bỏ các phần tử null

  res.status(200).json({
    success: true,
    count: result.length,
    data: result,
    message: result.length === 0 ? `No invoices found with the given filters` : '',
  });
});

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get invoice by ID (Staff or Admin only)
 *     tags: [Invoices]
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
 *         description: Invoice details with aggregated items
 *       404:
 *         description: Invoice not found
 *       403:
 *         description: Staff or Admin access required
 */
const getInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('table_id', 'name table_number')
    .populate({
      path: 'order_group_id',
      populate: {
        path: 'orders',
        populate: { path: 'items.item_id', select: 'name price description image_url category_id order_count' },
      },
    });

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const orderGroup = invoice.order_group_id;
  const aggregatedItems = {};
  let totalCost = orderGroup.total_cost;

  orderGroup.orders.forEach(order => {
    order.items.forEach(item => {
      const itemId = item.item_id._id.toString();
      if (!aggregatedItems[itemId]) {
        aggregatedItems[itemId] = {
          item_id: item.item_id,
          quantity: 0,
          price: item.price,
        };
      }
      aggregatedItems[itemId].quantity += item.quantity;
    });
  });

  const result = {
    _id: invoice._id,
    invoice_number: invoice.invoice_number,
    table_id: invoice.table_id,
    total_cost: totalCost,
    payment_method: invoice.payment_method,
    payment_date: invoice.payment_date,
    restaurant_info: invoice.restaurant_info,
    order_group_id: {
      _id: orderGroup._id,
      total_cost: totalCost,
      items: Object.values(aggregatedItems),
    },
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    __v: invoice.__v,
  };

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @swagger
 * /invoices/order-group/{order_group_id}:
 *   get:
 *     summary: Get invoice by order group ID (Staff or Admin only, for paid order groups)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order_group_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order group
 *     responses:
 *       200:
 *         description: Invoice details with aggregated items
 *       404:
 *         description: Invoice or order group not found, or order group not paid
 *       403:
 *         description: Staff or Admin access required
 *       500:
 *         description: Internal server error
 */
const getInvoiceByOrderGroupId = asyncHandler(async (req, res) => {
  const { order_group_id } = req.params;

  // Kiểm tra order group có tồn tại và đã thanh toán chưa
  const orderGroup = await OrderGroup.findOne({
    _id: order_group_id,
    payment_status: 'Đã thanh toán',
    restaurant_id: req.user.restaurant_id,
  }).populate('table_id', 'name table_number');

  if (!orderGroup) {
    res.status(404);
    throw new Error('Order group not found or not paid');
  }

  // Lấy invoice dựa trên order_group_id
  const invoice = await Invoice.findOne({ order_group_id })
    .populate('table_id', 'name table_number')
    .populate({
      path: 'order_group_id',
      populate: {
        path: 'orders',
        populate: { path: 'items.item_id', select: 'name price description image_url category_id order_count' },
      },
    });

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found for this order group');
  }

  const orderGroupData = invoice.order_group_id;
  const aggregatedItems = {};
  let totalCost = orderGroupData.total_cost || 0;

  // Kiểm tra và xử lý orders
  if (orderGroupData.orders) {
    orderGroupData.orders.forEach(order => {
      if (order && order.items) {
        order.items.forEach(item => {
          if (item && item.item_id && item.item_id._id) {
            const itemId = item.item_id._id.toString();
            if (!aggregatedItems[itemId]) {
              aggregatedItems[itemId] = {
                item_id: item.item_id,
                quantity: 0,
                price: item.price || 0,
              };
            }
            aggregatedItems[itemId].quantity += item.quantity || 1;
          }
        });
      }
    });
  }

  const result = {
    _id: invoice._id,
    invoice_number: invoice.invoice_number,
    table_id: invoice.table_id,
    total_cost: totalCost,
    payment_method: invoice.payment_method,
    payment_date: invoice.payment_date,
    restaurant_info: invoice.restaurant_info,
    order_group_id: {
      _id: orderGroupData._id,
      total_cost: totalCost,
      items: Object.values(aggregatedItems),
    },
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    __v: invoice.__v,
  };

  res.status(200).json({
    success: true,
    data: result,
  });
});

const createInvoice = asyncHandler(async (req, orderGroup) => {
  // Kiểm tra xem Invoice đã tồn tại cho order_group_id này chưa
  const existingInvoice = await Invoice.findOne({ order_group_id: orderGroup._id });
  if (existingInvoice) {
    return existingInvoice; // Trả về Invoice hiện tại, không tạo mới
  }

  // Lấy thông tin nhà hàng từ restaurant_id
  const restaurant = await Restaurant.findById(orderGroup.restaurant_id).select('name address _id');
  if (!restaurant) {
    throw new Error('Restaurant not found for this OrderGroup');
  }

  // Sinh invoice_number
  const sequenceValue = await getNextSequenceValue('invoice_number');
  const invoiceNumber = getInvoiceNumber(sequenceValue);

  // Tạo Invoice mới
  const invoice = new Invoice({
    invoice_number: invoiceNumber,
    order_group_id: orderGroup._id,
    table_id: orderGroup.table_id,
    total_cost: orderGroup.total_cost || 0,
    payment_method: orderGroup.payment_method || 'Không xác định',
    payment_date: orderGroup.payment_date || new Date(),
    restaurant_info: {
      restaurant_id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address,
    },
  });

  // Lưu vào database
  await invoice.save();
  return invoice;
});

export { createInvoice, getInvoices, getInvoiceById, getInvoiceByOrderGroupId };