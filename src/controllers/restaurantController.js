import asyncHandler from 'express-async-handler';
import Restaurant from '../models/Restaurant.js';

/**
 * @swagger
 * /restaurants:
 *   get:
 *     summary: Get all restaurants of the current admin (Authenticated)
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of restaurants for the current admin
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
 *                       slug:
 *                         type: string
 *                       address:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       banner_url:
 *                         type: string
 *                       introduction:
 *                         type: string
 *                       thumbnail:
 *                         type: string
 *                       google_map_link:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
const getAllRestaurants = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const restaurants = await Restaurant.find({ owner_id: req.user._id });

  res.status(200).json({
    success: true,
    count: restaurants.length,
    data: restaurants,
  });
});

/**
 * @swagger
 * /restaurants/{slug}:
 *   get:
 *     summary: Get restaurant details by slug (Public)
 *     tags: [Restaurants]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Restaurant details
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
 *                     slug:
 *                       type: string
 *                     address:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     banner_url:
 *                       type: string
 *                     introduction:
 *                       type: string
 *                     thumbnail:
 *                       type: string
 *                     google_map_link:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Restaurant not found
 */
const getRestaurantBySlug = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug });

  if (!restaurant) {
    res.status(404);
    throw new Error('Restaurant not found');
  }

  res.status(200).json({
    success: true,
    data: restaurant,
  });
});

export { getRestaurantBySlug, getAllRestaurants };