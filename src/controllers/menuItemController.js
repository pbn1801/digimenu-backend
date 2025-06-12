import asyncHandler from 'express-async-handler';
import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';
import Restaurant from '../models/Restaurant.js';
import cloudinary from '../config/cloudinary.js';
import fs from 'fs';

/**
 * @swagger
 * /menu-items:
 *   get:
 *     summary: Get all menu items (Public)
 *     tags: [MenuItems]
 *     responses:
 *       200:
 *         description: List of menu items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       price:
 *                         type: number
 *                       description:
 *                         type: string
 *                       image_url:
 *                         type: string
 *                       category_id:
 *                         type: string
 *                       order_count:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: ['visible', 'hidden']
 */
const getMenuItems = asyncHandler(async (req, res) => {
  const menuItems = await MenuItem.find()
    .populate('category_id', 'name status')
    .populate('restaurant_id', 'name');

  res.status(200).json({
    success: true,
    count: menuItems.length,
    data: menuItems,
  });
});

/**
 * @swagger
 * /menu-items/{id}:
 *   get:
 *     summary: Get a menu item by ID (Public)
 *     tags: [MenuItems]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Menu item details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *                     description:
 *                       type: string
 *                     image_url:
 *                       type: string
 *                     category_id:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: ['visible', 'hidden']
 *                     restaurant_id:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                     order_count:
 *                       type: number
 *                     status:
 *                       type: string
 *                       enum: ['visible', 'hidden']
 *       404:
 *         description: Menu item not found
 */
const getMenuItemById = asyncHandler(async (req, res) => {
  const menuItem = await MenuItem.findById(req.params.id)
    .populate('category_id', 'name status')
    .populate('restaurant_id', 'name');

  if (!menuItem) {
    res.status(404);
    throw new Error('Menu item not found');
  }

  res.status(200).json({
    success: true,
    data: menuItem,
  });
});

/**
 * @swagger
 * /menu-items/category/{category_id}:
 *   get:
 *     summary: Get menu items by category (Public)
 *     tags: [MenuItems]
 *     parameters:
 *       - in: path
 *         name: category_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The category ID (use "null" to get unclassified items)
 *     responses:
 *       200:
 *         description: List of menu items in the category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       price:
 *                         type: number
 *                       description:
 *                         type: string
 *                       image_url:
 *                         type: string
 *                       category_id:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: ['visible', 'hidden']
 *                       restaurant_id:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                           type: string
 *                       order_count:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: ['visible', 'hidden']
 *       404:
 *         description: Category not found
 *       400:
 *         description: Invalid category ID
 */
const getMenuItemsByCategory = asyncHandler(async (req, res) => {
  const { category_id } = req.params;

  // Validate category_id format
  if (!category_id) {
    res.status(400);
    throw new Error('Category ID is required');
  }

  let queryCondition;

  if (category_id.toLowerCase() === 'null') {
    queryCondition = { category_id: null };
  } else {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(category_id);
    if (!isValidObjectId) {
      res.status(400);
      throw new Error('Invalid category ID format');
    }

    const category = await Category.findById(category_id);
    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }

    queryCondition = { category_id };
  }

  const menuItems = await MenuItem.find(queryCondition)
    .populate('category_id', 'name status')
    .populate('restaurant_id', 'name');

  res.status(200).json({
    success: true,
    count: menuItems.length,
    data: menuItems,
  });
});

/**
 * @swagger
 * /menu-items/grouped-by-category:
 *   get:
 *     summary: Get all menu items grouped by category (Public)
 *     tags: [MenuItems]
 *     responses:
 *       200:
 *         description: List of menu items grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   products:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         price:
 *                           type: number
 *                         description:
 *                           type: string
 *                         image_url:
 *                           type: string
 *                         order_count:
 *                           type: number
 *                         status:
 *                           type: string
 *                           enum: ['visible', 'hidden']
 *                         category_id:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             status:
 *                               type: string
 *                               enum: ['visible', 'hidden']
 *                         restaurant_id:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             name:
 *                               type: string
 */
const getMenuItemsGroupedByCategory = asyncHandler(async (req, res) => {
  // Sử dụng aggregation để nhóm theo category_id
  const menuItems = await MenuItem.aggregate([
    {
      $lookup: {
        from: 'categories', // Tên collection của Category trong MongoDB
        localField: 'category_id',
        foreignField: '_id',
        as: 'category_details',
      },
    },
    {
      $unwind: {
        path: '$category_details',
        preserveNullAndEmptyArrays: true, // Giữ các item không có category
      },
    },
    {
      $group: {
        _id: '$category_details._id',
        name: { $first: '$category_details.name' },
        status: { $first: '$category_details.status' },
        products: {
          $push: {
            id: '$_id',
            name: '$name',
            price: '$price',
            description: '$description',
            image_url: '$image_url',
            order_count: '$order_count',
            status: '$status',
            category_id: '$category_details',
            restaurant_id: '$restaurant_id',
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        id: '$_id',
        name: 1,
        status: 1,
        products: 1,
      },
    },
  ]);

  // Chuyển đổi dữ liệu để phù hợp với cấu trúc mong muốn
  const responseData = menuItems.map((category) => ({
    id: category._id || 'uncategorized',
    name: category.name || 'Chưa phân loại',
    products: category.products,
  }));

  res.status(200).json({
    success: true,
    count: responseData.reduce((sum, cat) => sum + cat.products.length, 0),
    data: responseData,
  });
});

/**
 * @swagger
 * /menu-items/add:
 *   post:
 *     summary: Add a new menu item (Admin only)
 *     tags: [MenuItems]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               category_id:
 *                 type: string
 *                 description: Optional, leave empty for unclassified
 *               status:
 *                 type: string
 *                 enum: ['visible', 'hidden']
 *                 default: 'visible'
 *     responses:
 *       201:
 *         description: Menu item created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Admin access required
 */
const addMenuItem = asyncHandler(async (req, res) => {
  const { name, price, description, category_id, status } = req.body;

  if (!name || !price) {
    res.status(400);
    throw new Error('Name and price are required');
  }

  if (!req.user || !req.user.restaurant_id) {
    res.status(400);
    throw new Error('Restaurant ID not found in user session');
  }

  if (category_id) {
    const category = await Category.findById(category_id);
    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }
    if (category.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
      res.status(403);
      throw new Error('Category does not belong to your restaurant');
    }
  }

  let image_url = null;
  if (req.file) {
    try {
      const publicId = `menu-item-${req.user.restaurant_id}-${Date.now()}`;
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'menu-items',
        public_id: publicId,
        fetch_format: 'auto',
        quality: 'auto',
        crop: 'auto',
        gravity: 'auto',
      });

      if (!result.secure_url) {
        throw new Error('Failed to upload image to Cloudinary');
      }

      image_url = result.secure_url;

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  const menuItem = await MenuItem.create({
    restaurant_id: req.user.restaurant_id,
    name,
    price,
    description,
    image_url,
    category_id: category_id || null,
    status: status || 'visible',
  });

  const populatedMenuItem = await MenuItem.findById(menuItem._id)
    .populate('category_id', 'name status')
    .populate('restaurant_id', 'name');

  res.status(201).json({
    success: true,
    data: populatedMenuItem,
  });
});

/**
 * @swagger
 * /menu-items/update/{id}:
 *   put:
 *     summary: Update a menu item (Admin only)
 *     tags: [MenuItems]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               category_id:
 *                 type: string
 *                 description: Optional, leave empty for unclassified
 *               status:
 *                 type: string
 *                 enum: ['visible', 'hidden']
 *     responses:
 *       200:
 *         description: Menu item updated
 *       404:
 *         description: Menu item not found
 *       403:
 *         description: Admin access required
 */
const updateMenuItem = asyncHandler(async (req, res) => {
  const { name, price, description, category_id, status } = req.body;

  const menuItem = await MenuItem.findById(req.params.id);
  if (!menuItem) {
    res.status(404);
    throw new Error('Menu item not found');
  }

  if (menuItem.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
    res.status(403);
    throw new Error('Menu item does not belong to your restaurant');
  }

  if (category_id) {
    const category = await Category.findById(category_id);
    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }
    if (category.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
      res.status(403);
      throw new Error('Category does not belong to your restaurant');
    }
    menuItem.category_id = category_id;
  } else if (category_id === '' || category_id === undefined) {
    menuItem.category_id = null;
  }

  if (req.file) {
    try {
      if (menuItem.image_url) {
        const publicId = menuItem.image_url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`menu-items/${publicId}`);
      }

      const publicId = `menu-item-${req.user.restaurant_id}-${Date.now()}`;
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'menu-items',
        public_id: publicId,
        fetch_format: 'auto',
        quality: 'auto',
        crop: 'auto',
        gravity: 'auto',
      });

      if (!result.secure_url) {
        throw new Error('Failed to upload image to Cloudinary');
      }

      menuItem.image_url = result.secure_url;

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  if (name) menuItem.name = name;
  if (price) menuItem.price = price;
  if (description !== undefined) menuItem.description = description;
  if (status) menuItem.status = status;

  await menuItem.save();

  const populatedMenuItem = await MenuItem.findById(menuItem._id)
    .populate('category_id', 'name status')
    .populate('restaurant_id', 'name');

  res.status(200).json({
    success: true,
    data: populatedMenuItem,
  });
});

/**
 * @swagger
 * /menu-items/delete/{id}:
 *   delete:
 *     summary: Delete a menu item (Admin only)
 *     tags: [MenuItems]
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
 *         description: Menu item deleted
 *       404:
 *         description: Menu item not found
 *       403:
 *         description: Admin access required
 */
const deleteMenuItem = asyncHandler(async (req, res) => {
  const menuItem = await MenuItem.findById(req.params.id);
  if (!menuItem) {
    res.status(404);
    throw new Error('Menu item not found');
  }

  if (menuItem.restaurant_id.toString() !== req.user.restaurant_id.toString()) {
    res.status(403);
    throw new Error('Menu item does not belong to your restaurant');
  }

  if (menuItem.image_url) {
    const publicId = menuItem.image_url.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`menu-items/${publicId}`);
  }

  await menuItem.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Menu item deleted',
  });
});

export {
  addMenuItem,
  getMenuItems,
  getMenuItemById,
  getMenuItemsByCategory,
  updateMenuItem,
  deleteMenuItem,
  getMenuItemsGroupedByCategory,
};