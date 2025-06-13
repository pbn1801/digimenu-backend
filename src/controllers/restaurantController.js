import asyncHandler from 'express-async-handler';
import Restaurant from '../models/Restaurant.js';

/**
 * @swagger
 * /restaurants:
 *   get:
 *     summary: Get all restaurants (Public)
 *     tags: [Restaurants]
 *     responses:
 *       200:
 *         description: List of all restaurants
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
 */
const getAllRestaurants = asyncHandler(async (req, res) => {
  const { slug } = req.query;

  if (slug) {
    const restaurant = await Restaurant.findOne({ slug });

    if (!restaurant) {
      res.status(404);
      throw new Error('Restaurant not found');
    }

    res.status(200).json({
      success: true,
      data: restaurant,
    });
  } else {
    const restaurants = await Restaurant.find();

    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants,
    });
  }
});

export { getAllRestaurants };