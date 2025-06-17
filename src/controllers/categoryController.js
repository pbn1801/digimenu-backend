import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';

/**
 * @swagger
 * /categories/add:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the category
 *               description:
 *                 type: string
 *                 description: Description of the category
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const restaurant_id = req.user.restaurant_id;

  if (!name) {
    res.status(400);
    throw new Error('Name is required');
  }

  if (!restaurant_id) {
    res.status(400);
    throw new Error('Restaurant ID not found for this user');
  }

  const categoryExists = await Category.findOne({ name, restaurant_id });
  if (categoryExists) {
    res.status(400);
    throw new Error('Category already exists for this restaurant');
  }

  const category = await Category.create({
    name,
    description,
    restaurant_id
  });

  res.status(201).json({
    success: true,
    data: category,
  });
});

/**
 * @swagger
 * /categories/all:
 *   get:
 *     summary: Get all categories including "Món khác" for unclassified items
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of categories
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
 *                       description:
 *                         type: string
 *                       restaurant_id:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 */
const getCategories = asyncHandler(async (req, res) => {
  // Lấy tất cả category
  const categories = await Category.find()
    .populate('restaurant_id', 'name');

  // Lấy danh sách restaurant_id duy nhất từ categories
  const restaurantIds = [...new Set(categories.map(cat => cat.restaurant_id._id.toString()))];

  // Xử lý "Món khác" cho mỗi restaurant_id
  for (const restaurantId of restaurantIds) {
    const unclassifiedCount = await MenuItem.countDocuments({ restaurant_id: restaurantId, category_id: null, status: 'visible' });
    if (unclassifiedCount > 0) {
      const restaurantName = categories.find(cat => cat.restaurant_id._id.toString() === restaurantId)?.restaurant_id.name || 'Unknown';
      categories.push({
        _id: `uncategorized-${restaurantId}`,
        name: 'Món khác',
        description: 'Các món chưa được phân loại',
        restaurant_id: { _id: restaurantId, name: restaurantName },
      });
    }
  }

  res.status(200).json({
    success: true,
    count: categories.length,
    data: categories,
  });
});

/**
 * @swagger
 * /categories/get/{id}:
 *   get:
 *     summary: Get a category by ID with menu items and count
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the category or 'uncategorized-<restaurant_id>' for unclassified items
 *     responses:
 *       200:
 *         description: Category details with menu items and count
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
 *                     description:
 *                       type: string
 *                     restaurant_id:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                     menu_items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *                           description:
 *                             type: string
 *                           image_url:
 *                             type: string
 *                           order_count:
 *                             type: number
 *                           status:
 *                             type: string
 *                             enum: ['visible', 'hidden']
 *                     item_count:
 *                       type: integer
 *       404:
 *         description: Category not found
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let category;
  let menuItems;

  if (id.startsWith('uncategorized-')) {
    const restaurantId = id.split('-')[1];
    category = {
      _id: id,
      name: 'Món khác',
      description: 'Các món chưa được phân loại',
      restaurant_id: { _id: restaurantId, name: 'Unknown' },
    };
    menuItems = await MenuItem.find({ restaurant_id: restaurantId, category_id: null, status: 'visible' })
      .select('_id name price description image_url order_count status');
  } else {
    category = await Category.findById(id)
      .populate('restaurant_id', 'name');
    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }
    menuItems = await MenuItem.find({ restaurant_id: category.restaurant_id._id, category_id: id, status: 'visible' })
      .select('_id name price description image_url order_count status');
  }

  const itemCount = menuItems.length;

  res.status(200).json({
    success: true,
    data: {
      _id: category._id,
      name: category.name,
      description: category.description,
      restaurant_id: category.restaurant_id,
      menu_items: menuItems,
      item_count: itemCount,
    },
  });
});

/**
 * @swagger
 * /categories/update/{id}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the category
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category updated successfully
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const restaurant_id = req.user.restaurant_id;

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  if (category.restaurant_id.toString() !== restaurant_id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this category');
  }

  category.name = name || category.name;
  category.description = description || category.description;

  const updatedCategory = await category.save();

  res.status(200).json({
    success: true,
    data: updatedCategory,
  });
});

/**
 * @swagger
 * /categories/delete/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the category
 *     responses:
 *       200:
 *         description: Category deleted successfully
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const restaurant_id = req.user.restaurant_id;

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  if (category.restaurant_id.toString() !== restaurant_id.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this category');
  }

  await MenuItem.updateMany(
    { category_id: category._id },
    { $set: { category_id: null } }
  );

  await category.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Category deleted successfully',
  });
});

export {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};