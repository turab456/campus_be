// backend/src/controllers/categoryController.js
const Category = require('../models/Category');
const { logger } = require('../utils/logger');
const { getCache, setCache, clearCache } = require('../utils/redis');

// @desc   Get all categories (public)
// @route  GET /api/categories
// @access Public
const getAll = async (req, res) => {
  try {
    const cacheKey = 'categories:all';
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      logger.info('[Cache Hit] Serving categories from cache.');
      return res.json(cachedData);
    }

    const categories = await Category.find().sort({ name: 1 });
    const responseData = { success: true, categories };
    await setCache(cacheKey, responseData, 3600); // Cache for 1 hour
    res.json(responseData);
  } catch (error) {
    logger.error('Get categories error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create a new category (admin only)
// @route  POST /api/categories
// @access Private (admin middleware should be applied in routes)
const createCategory = async (req, res) => {
  const { name, icon } = req.body;
  try {
    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }
    const category = await Category.create({ name, icon });
    await clearCache('categories:all');
    await clearCache('listings:*');
    res.status(201).json({ success: true, category });
  } catch (error) {
    logger.error('Create category error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Update a category (admin only)
// @route  PUT /api/categories/:id
// @access Private
const updateCategory = async (req, res) => {
  const { name, icon } = req.body;
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    if (name) category.name = name;
    if (icon) category.icon = icon;
    await category.save();
    await clearCache('categories:all');
    await clearCache('listings:*');
    res.json({ success: true, category });
  } catch (error) {
    logger.error('Update category error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Delete a category (admin only)
// @route  DELETE /api/categories/:id
// @access Private
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    await Category.deleteOne({ _id: category._id });
    await clearCache('categories:all');
    await clearCache('listings:*');
    res.json({ success: true, message: 'Category removed' });
  } catch (error) {
    logger.error('Delete category error', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getAll, createCategory, updateCategory, deleteCategory };
